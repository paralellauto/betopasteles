// Deskdog — el nucleo de la app.
//
// Toda la logica del perro vive aqui, en Rust, no en la interfaz. Eso significa:
//   - el pomodoro sigue corriendo aunque cierres el panel
//   - las dos ventanas (perro y panel) siempre muestran lo mismo
//   - las estadisticas se guardan solas al disco
//
// La interfaz solo pinta lo que este archivo le manda y le avisa cuando
// el usuario hace clic.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};

// ---------------------------------------------------------------------------
// Ajustes — los mismos numeros del prototipo
// ---------------------------------------------------------------------------

const FOCUS_REAL: u32 = 25 * 60; // 25 minutos de enfoque
const BREAK_REAL: u32 = 5 * 60; //  5 minutos de descanso
const FOCUS_DEMO: u32 = 20; // modo demo: ciclos de segundos
const BREAK_DEMO: u32 = 12;

// Tamano del perro en pantalla (pixeles logicos, como en el prototipo)
const SPRITE_W: f64 = 178.0;
const SPRITE_H: f64 = 148.0;
// Alto de la franja transparente que ocupa el borde inferior de la pantalla.
// Tiene que dar cabida al perro (148) MAS el globo de dialogo encima, que puede
// ocupar tres lineas. Con 200 el globo se salia por arriba y quedaba cortado.
const STRIP_H: f64 = 340.0;
// Cuanto se levanta el perro respecto al borde inferior (deja aire para el Dock)
const GROUND_OFFSET: f64 = 10.0;
// Aire minimo entre el borde de la pantalla y lo que se dibuja.
// Tiene que coincidir con MARGEN en src/dogWindow.jsx
const MARGEN: f64 = 8.0;

// A que velocidad camina, en pixeles por segundo.
//
// El prototipo usaba un porcentaje del ancho por segundo, pero eso hace que en
// una pantalla grande el perro salga disparado: en un monitor de 2560 px eran
// 717 px/s. Fijandolo en pixeles camina igual en cualquier pantalla, y el
// ritmo de las patas cuadra con lo que avanza.
//
// Si quieres que vaya mas rapido o mas lento, este es el numero. Al cambiarlo,
// ajusta tambien la duracion de `.dd-walk` en src/styles.css para que las
// patas sigan el mismo compas.
const SPEED_PX_S: f64 = 200.0;

// ---------------------------------------------------------------------------
// El estado del perro
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DogState {
    /// "idle" | "focus" | "break"
    pub mode: String,
    /// segundos que le quedan al temporizador
    pub time_left: u32,
    /// pomodoros completados (se guarda entre sesiones)
    pub pomodoros: u32,

    pub hambre: f64,
    pub energia: f64,
    pub felicidad: f64,

    /// "idle" | "sleep" | "walking" | "eating" | "happy"
    pub activity: String,
    /// posicion horizontal, 0-100 (% del ancho de la pantalla)
    pub dog_x: f64,
    /// 1 mira a la derecha, -1 a la izquierda
    pub facing: i8,
    /// cuanto tarda la caminata actual, en segundos (para la animacion CSS)
    pub walk_dur: f64,

    /// texto del globo de dialogo ("" = sin globo)
    pub msg: String,

    /// modo demo: ciclos de segundos en vez de minutos
    pub demo: bool,
}

impl Default for DogState {
    fn default() -> Self {
        Self {
            mode: "idle".into(),
            time_left: FOCUS_REAL,
            pomodoros: 0,
            hambre: 70.0,
            energia: 80.0,
            felicidad: 75.0,
            activity: "idle".into(),
            dog_x: 50.0,
            facing: 1,
            walk_dur: 1.2,
            msg: "Inicia un pomodoro y te acompaño".into(),
            demo: false,
        }
    }
}

/// Lo unico que se guarda al disco. El temporizador siempre arranca en frio.
#[derive(Serialize, Deserialize)]
struct Saved {
    pomodoros: u32,
    hambre: f64,
    energia: f64,
    felicidad: f64,
    demo: bool,
}

pub struct AppState {
    dog: Mutex<DogState>,
    /// cuando termina la actividad temporal (comer, celebrar, caminar)
    activity_until: Mutex<Option<Instant>>,
    /// cuando se borra el globo de dialogo
    msg_until: Mutex<Option<Instant>>,
    /// geometria de la pantalla, en pixeles fisicos
    screen: Mutex<Screen>,
}

#[derive(Clone, Copy, Default)]
struct Screen {
    width: f64,
    height: f64,
    scale: f64,
}

fn clamp(v: f64) -> f64 {
    v.clamp(0.0, 100.0)
}

impl DogState {
    fn focus_len(&self) -> u32 {
        if self.demo {
            FOCUS_DEMO
        } else {
            FOCUS_REAL
        }
    }
    fn break_len(&self) -> u32 {
        if self.demo {
            BREAK_DEMO
        } else {
            BREAK_REAL
        }
    }
}

// ---------------------------------------------------------------------------
// Guardar y cargar
// ---------------------------------------------------------------------------

fn save_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("deskdog.json"))
}

fn load_saved(app: &AppHandle) -> Option<Saved> {
    let path = save_path(app)?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn persist(app: &AppHandle, s: &DogState) {
    if let Some(path) = save_path(app) {
        let saved = Saved {
            pomodoros: s.pomodoros,
            hambre: s.hambre,
            energia: s.energia,
            felicidad: s.felicidad,
            demo: s.demo,
        };
        if let Ok(text) = serde_json::to_string_pretty(&saved) {
            let _ = std::fs::write(path, text);
        }
    }
}

// ---------------------------------------------------------------------------
// Avisar a las ventanas
// ---------------------------------------------------------------------------

fn broadcast(app: &AppHandle, s: &DogState) {
    let _ = app.emit("deskdog:state", s);
}

fn say(s: &mut DogState, app: &AppHandle, text: &str, secs: u64) {
    s.msg = text.to_string();
    if let Some(state) = app.try_state::<AppState>() {
        *state.msg_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(secs));
    }
}

// ---------------------------------------------------------------------------
// Comandos que la interfaz puede llamar
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_state(state: tauri::State<AppState>) -> DogState {
    state.dog.lock().unwrap().clone()
}

#[tauri::command]
fn start(app: AppHandle, state: tauri::State<AppState>) {
    let mut s = state.dog.lock().unwrap();
    s.mode = "focus".into();
    s.time_left = s.focus_len();
    s.activity = "sleep".into();
    *state.activity_until.lock().unwrap() = None;
    say(&mut s, &app, "A trabajar. Aquí te cuido", 4);
    broadcast(&app, &s);
}

#[tauri::command]
fn stop(app: AppHandle, state: tauri::State<AppState>) {
    let mut s = state.dog.lock().unwrap();
    s.mode = "idle".into();
    s.activity = "idle".into();
    s.time_left = s.focus_len();
    *state.activity_until.lock().unwrap() = None;
    say(&mut s, &app, "Sesión detenida. Aquí sigo, sin prisa", 4);
    broadcast(&app, &s);
}

#[tauri::command]
fn feed(app: AppHandle, state: tauri::State<AppState>) {
    let mut s = state.dog.lock().unwrap();
    if s.activity == "sleep" {
        say(&mut s, &app, "Shhh… está dormido. Espera al descanso", 4);
        broadcast(&app, &s);
        return;
    }
    s.activity = "eating".into();
    s.hambre = clamp(s.hambre + 35.0);
    *state.activity_until.lock().unwrap() = Some(Instant::now() + Duration::from_millis(2000));
    say(&mut s, &app, "Ñam. Gracias", 3);
    persist(&app, &s);
    broadcast(&app, &s);
}

#[tauri::command]
fn treat(app: AppHandle, state: tauri::State<AppState>) {
    let mut s = state.dog.lock().unwrap();
    if s.activity == "sleep" {
        say(&mut s, &app, "Shhh… está dormido. Espera al descanso", 4);
        broadcast(&app, &s);
        return;
    }
    s.activity = "happy".into();
    s.felicidad = clamp(s.felicidad + 20.0);
    s.hambre = clamp(s.hambre + 8.0);
    *state.activity_until.lock().unwrap() = Some(Instant::now() + Duration::from_millis(2200));
    say(&mut s, &app, "¡Un premio! Eres el mejor humano", 3);
    persist(&app, &s);
    broadcast(&app, &s);
}

/// La interfaz manda el punto (0-100) donde el usuario hizo clic.
#[tauri::command]
fn walk_to(app: AppHandle, state: tauri::State<AppState>, x: f64) {
    let mut s = state.dog.lock().unwrap();
    if s.activity == "sleep" {
        say(
            &mut s,
            &app,
            "Duerme durante el enfoque. En el descanso paseamos",
            4,
        );
        broadcast(&app, &s);
        return;
    }
    if s.activity == "eating" {
        return;
    }
    let target = clamp(x);
    let dist = (target - s.dog_x).abs();
    if dist < 3.0 {
        return;
    }
    s.facing = if target > s.dog_x { 1 } else { -1 };

    // `dist` va en porcentaje del ancho: se pasa a pixeles para que la
    // velocidad no dependa del tamano de la pantalla.
    let screen = *state.screen.lock().unwrap();
    let ancho_logico = if screen.scale > 0.0 {
        screen.width / screen.scale
    } else {
        1280.0
    };
    let dist_px = dist / 100.0 * ancho_logico;
    s.walk_dur = (dist_px / SPEED_PX_S).max(0.35);
    s.activity = "walking".into();
    s.dog_x = target;
    s.felicidad = clamp(s.felicidad + 4.0);
    let ms = (s.walk_dur * 1000.0) as u64;
    *state.activity_until.lock().unwrap() = Some(Instant::now() + Duration::from_millis(ms));
    broadcast(&app, &s);
}

#[tauri::command]
fn set_demo(app: AppHandle, state: tauri::State<AppState>, demo: bool) {
    let mut s = state.dog.lock().unwrap();
    s.demo = demo;
    s.mode = "idle".into();
    s.activity = "idle".into();
    s.time_left = s.focus_len();
    persist(&app, &s);
    broadcast(&app, &s);
}

#[tauri::command]
fn toggle_panel(app: AppHandle) {
    if let Some(w) = app.get_webview_window("panel") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(w) = app.get_webview_window("panel") {
        let _ = w.hide();
    }
}

// ---------------------------------------------------------------------------
// Colocar la ventana del perro pegada al borde inferior de la pantalla
// ---------------------------------------------------------------------------

/// Estira la ventana del perro a lo ancho de la pantalla y la pega abajo.
///
/// Devuelve `true` si la ventana quedó donde le pedimos.
///
/// Ojo: en macOS, colocar una ventana que todavía está oculta no funciona; el
/// sistema la vuelve a colocar a su manera al mostrarla y descarta lo que le
/// pedimos. Por eso esto se llama DESPUÉS de `show()`, y varias veces, hasta
/// que el sistema hace caso.
fn place_dog_window(app: &AppHandle, dog: &WebviewWindow) -> bool {
    let monitor = match dog.primary_monitor() {
        Ok(Some(m)) => m,
        _ => {
            println!("[deskdog] AVISO: no se pudo leer el monitor principal");
            return false;
        }
    };
    let size = monitor.size();
    let pos = monitor.position();
    let scale = monitor.scale_factor();

    let strip_h_px = (STRIP_H * scale).round() as u32;
    let target_size = PhysicalSize::new(size.width, strip_h_px);
    let target_pos = PhysicalPosition::new(
        pos.x,
        pos.y + size.height as i32 - strip_h_px as i32,
    );

    let _ = dog.set_size(target_size);
    let _ = dog.set_position(target_pos);

    if let Some(state) = app.try_state::<AppState>() {
        *state.screen.lock().unwrap() = Screen {
            width: size.width as f64,
            height: size.height as f64,
            scale,
        };
    }

    // ¿Nos hizo caso? Toleramos unos pocos píxeles de diferencia: algunos
    // sistemas ajustan la ventana para no tapar barras o bordes.
    match (dog.outer_position(), dog.outer_size()) {
        (Ok(p), Ok(sz)) => {
            let ok = (p.x - target_pos.x).abs() <= 4
                && (p.y - target_pos.y).abs() <= 4
                && sz.width.abs_diff(target_size.width) <= 4;
            if !ok {
                println!(
                    "[deskdog] la ventana no obedecio todavia: pedimos {:?}/{:?}, quedo {:?}/{:?}",
                    target_pos, target_size, p, sz
                );
            }
            ok
        }
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Click-through: los clics atraviesan la ventana salvo cuando tocan al perro
// ---------------------------------------------------------------------------

fn update_click_through(app: &AppHandle) {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return,
    };
    let dog_win = match app.get_webview_window("dog") {
        Some(w) => w,
        None => return,
    };

    let (mode, activity, dog_x) = {
        let s = state.dog.lock().unwrap();
        (s.mode.clone(), s.activity.clone(), s.dog_x)
    };
    let screen = *state.screen.lock().unwrap();
    if screen.width <= 0.0 {
        return;
    }

    // Mientras duerme, la ventana es completamente invisible al raton:
    // los clics van al escritorio real, no interrumpimos el enfoque.
    if activity == "sleep" {
        let _ = dog_win.set_ignore_cursor_events(true);
        return;
    }

    let cursor = match app.cursor_position() {
        Ok(c) => c,
        Err(_) => return,
    };

    // En el descanso se puede señalar a donde caminar, pero solo responde la
    // banda de abajo, a la altura del perro. El globo de dialogo flota mas
    // arriba: si toda la franja capturase clics, el globo se los tragaria y
    // no llegarian al escritorio.
    if mode == "break" {
        // Justo la altura del perro: asi la banda termina donde empieza el
        // globo y no se solapan.
        let banda = (GROUND_OFFSET + SPRITE_H) * screen.scale;
        let en_la_banda = cursor.y >= screen.height - banda;
        let _ = dog_win.set_ignore_cursor_events(!en_la_banda);
        return;
    }

    // El resto del tiempo solo el perro captura clics.
    let sprite_w = SPRITE_W * screen.scale;
    let sprite_h = SPRITE_H * screen.scale;
    let ground = GROUND_OFFSET * screen.scale;

    // La interfaz mantiene al perro dentro de la pantalla cuando llega a un
    // extremo; aqui hay que aplicar el mismo limite, si no el rectangulo que
    // captura los clics se desplazaria respecto a donde se ve dibujado.
    let media = sprite_w / 2.0 + MARGEN * screen.scale;
    let center_x = if screen.width < sprite_w + MARGEN * 2.0 * screen.scale {
        screen.width / 2.0
    } else {
        (dog_x / 100.0 * screen.width).clamp(media, screen.width - media)
    };
    let left = center_x - sprite_w / 2.0;
    let right = center_x + sprite_w / 2.0;
    let bottom = screen.height - ground;
    let top = bottom - sprite_h;

    let over_dog =
        cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;

    let _ = dog_win.set_ignore_cursor_events(!over_dog);
}

// ---------------------------------------------------------------------------
// El latido: un tick por segundo mueve el temporizador y las estadisticas
// ---------------------------------------------------------------------------

fn tick(app: &AppHandle) {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return,
    };
    let mut should_persist = false;

    {
        let mut s = state.dog.lock().unwrap();

        // -- temporizador ---------------------------------------------------
        if s.mode != "idle" {
            if s.time_left > 1 {
                s.time_left -= 1;
            } else if s.mode == "focus" {
                s.mode = "break".into();
                s.time_left = s.break_len();
                s.activity = "happy".into();
                s.pomodoros += 1;
                *state.activity_until.lock().unwrap() =
                    Some(Instant::now() + Duration::from_millis(2500));
                say(
                    &mut s,
                    app,
                    "¡Terminaste! Toca el escritorio para pasearme",
                    6,
                );
                should_persist = true;
            } else {
                s.mode = "focus".into();
                s.time_left = s.focus_len();
                s.activity = "sleep".into();
                *state.activity_until.lock().unwrap() = None;
                say(
                    &mut s,
                    app,
                    "Fin del descanso. Me echo una siesta, tú concéntrate",
                    5,
                );
            }
        }

        // -- estadisticas ---------------------------------------------------
        // El prototipo decae cada 3s en demo y cada 12s en real. Aqui el tick
        // es de 1s, asi que aplicamos la fraccion correspondiente.
        let step = if s.demo { 1.0 / 3.0 } else { 1.0 / 12.0 };
        s.hambre = clamp(s.hambre - 1.0 * step);
        match s.activity.as_str() {
            "sleep" => s.energia = clamp(s.energia + 3.0 * step),
            "walking" => s.energia = clamp(s.energia - 2.0 * step),
            _ => s.energia = clamp(s.energia - 0.5 * step),
        }
        if s.activity != "walking" {
            s.felicidad = clamp(s.felicidad - 0.7 * step);
        }

        // -- fin de una actividad temporal -----------------------------------
        let mut until = state.activity_until.lock().unwrap();
        if let Some(t) = *until {
            if Instant::now() >= t {
                if s.activity != "sleep" {
                    s.activity = "idle".into();
                }
                *until = None;
            }
        }
        drop(until);

        // -- borrar el globo de dialogo --------------------------------------
        let mut mu = state.msg_until.lock().unwrap();
        if let Some(t) = *mu {
            if Instant::now() >= t {
                s.msg = String::new();
                *mu = None;
            }
        }
        drop(mu);

        if should_persist {
            persist(app, &s);
        }
        // Las estadisticas cambian en cada tick, asi que siempre avisamos.
        broadcast(app, &s);
    }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Estado inicial: lo guardado, si existe.
            let mut initial = DogState::default();
            if let Some(saved) = load_saved(&handle) {
                initial.pomodoros = saved.pomodoros;
                initial.hambre = saved.hambre;
                initial.energia = saved.energia;
                initial.felicidad = saved.felicidad;
                initial.demo = saved.demo;
                initial.time_left = initial.focus_len();
            }

            app.manage(AppState {
                dog: Mutex::new(initial),
                activity_until: Mutex::new(None),
                msg_until: Mutex::new(None),
                screen: Mutex::new(Screen::default()),
            });

            // Ventana del perro: franja transparente pegada abajo.
            if let Some(dog) = app.get_webview_window("dog") {
                let _ = dog.set_ignore_cursor_events(true);

                // Mostrar PRIMERO y colocar DESPUES: al reves, macOS descarta
                // la posicion que le pedimos.
                let _ = dog.show();
                place_dog_window(&handle, &dog);

                if let Ok(Some(m)) = dog.primary_monitor() {
                    println!(
                        "[deskdog] monitor -> {:?} {:?} escala {}",
                        m.position(),
                        m.size(),
                        m.scale_factor()
                    );
                }

                // El sistema puede recolocar la ventana justo despues de
                // mostrarla, asi que insistimos durante el primer segundo.
                let h = handle.clone();
                std::thread::spawn(move || {
                    for intento in 1..=10 {
                        std::thread::sleep(Duration::from_millis(100));
                        let Some(d) = h.get_webview_window("dog") else {
                            return;
                        };
                        if place_dog_window(&h, &d) {
                            if let (Ok(p), Ok(sz)) = (d.outer_position(), d.outer_size()) {
                                println!(
                                    "[deskdog] ventana colocada al intento {}: {:?} {:?}",
                                    intento, p, sz
                                );
                            }
                            return;
                        }
                    }
                    println!("[deskdog] AVISO: la ventana del perro nunca acepto la posicion");
                });
            }

            // --- Icono en la barra del sistema ------------------------------
            let mi_panel = MenuItemBuilder::with_id("panel", "Mostrar panel").build(app)?;
            let mi_dog = MenuItemBuilder::with_id("dog", "Mostrar / ocultar perro").build(app)?;
            let mi_start = MenuItemBuilder::with_id("start", "Iniciar pomodoro").build(app)?;
            let mi_stop = MenuItemBuilder::with_id("stop", "Detener").build(app)?;
            let mi_quit = MenuItemBuilder::with_id("quit", "Salir").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&mi_panel, &mi_dog])
                .separator()
                .items(&[&mi_start, &mi_stop])
                .separator()
                .items(&[&mi_quit])
                .build()?;

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Deskdog")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "panel" => toggle_panel(app.clone()),
                    "dog" => {
                        if let Some(w) = app.get_webview_window("dog") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                            }
                        }
                    }
                    "start" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            start(app.clone(), state);
                        }
                    }
                    "stop" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            stop(app.clone(), state);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // --- El latido -------------------------------------------------
            let tick_handle = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                tick(&tick_handle);
            });

            // --- Vigilar el raton para el click-through --------------------
            let cursor_handle = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(80));
                update_click_through(&cursor_handle);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            start,
            stop,
            feed,
            treat,
            walk_to,
            set_demo,
            toggle_panel,
            hide_panel,
        ])
        .run(tauri::generate_context!())
        .expect("error al arrancar Deskdog");
}
