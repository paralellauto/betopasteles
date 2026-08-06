// Evita que se abra una consola negra detrás de la app en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    deskdog_lib::run()
}
