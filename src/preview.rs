use std::{time::Duration};

// mod util;
use crate::{
    Args,
    manifest::{get_manifest, update_manifest},
    utils::*,
};
use console::style;
use indicatif::{ProgressBar, ProgressStyle};

struct Module {
    name: String,
    version: String,
}

pub fn main(_args: Args) {
    print!("{} Fetching Minecraft version...", style("[INFO]").blue());

    let mc_version = get_preview_minecraft_version();

    print!(
        "\r{} Install modules for Minecraft version: {}{}\n",
        style("[INFO]").blue(),
        mc_version,
        " ".repeat(10)
    );

    // println!("Fetching module versions...");

    let mut manifest = get_manifest();
    println!(
        "{} Manifest loaded. Fetching new module versions...",
        style("[LOG]").dim()
    );

    let mut modules: Vec<Module> = vec![];

    for dependency in &mut manifest.dependencies {
        let (module, _version) = (&dependency.module_name, &dependency.version);

        let versions = get_versions(module);
        let version = versions.iter().find(|&v| v.contains(&mc_version)).unwrap();

        dependency.version = extract_module_version(version);

        println!("{} {}: {}", style("[LOG]").dim(), module, version);

        modules.push(Module {
            name: module.clone(),
            version: version.to_string(),
        });
    }

    update_manifest(&manifest);
    println!(
        "{} Module versions fetched and manifest updated.",
        style("[LOG]").dim()
    );

    let pb = ProgressBar::new(modules.len() as u64);
    let template =
        "{spinner:.green} [{elapsed_precise}] [{bar:20.cyan/blue}] {pos}/{len} ({eta}) - {msg}";
    pb.set_style(
        ProgressStyle::with_template(template)
            .unwrap()
            .progress_chars("#>-"),
    );
    pb.enable_steady_tick(Duration::from_millis(80));

    for module in modules {
        pb.inc(1);
        pb.set_message(module.name.clone());

        run_npm(&[
            "install",
            format!("{}@{}", &module.name, &module.version).as_str(),
            "--save-dev",
            "--save-exact",
            "--force",
        ])
        .unwrap_or_else(|e| {
            eprintln!("{} Failed to install module {} \n\n{}\n\n{}\n{}", style("[ERROR]").red(), module.name, "=".repeat(30),style(e).dim(), "=".repeat(30));
            std::process::exit(1);
        });
    }

    pb.finish_with_message(format!(
        "\r{} All modules installed successfully.{}",
        style("[DONE]").green(),
        " ".repeat(10)
    ));
}

fn get_preview_minecraft_version() -> String {
    let versions = get_versions("@minecraft/server");
    let version = versions.iter().find(|&v| v.contains("-preview"));

    if let Some(version) = version {
        extract_mc_version(version)
    } else {
        eprintln!("{} No preview versions found.", style("[ERROR]").red());
        std::process::exit(1);
    }
}
