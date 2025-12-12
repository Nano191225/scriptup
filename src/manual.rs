use crate::{utils::{extract_mc_version, get_versions}, Args};



pub fn main(args: Args) {

    let version: String;
    if let Some(v) = args.version_ {
        version = v;
    } else {
        eprintln!("No version specified. Please provide a version.");
        std::process::exit(1);
    }

    let versions = get_versions("@minecraft/server");

    

    // println!("Versions: {:?}", versions);

    if let Some(version) = versions.iter().find(|&v| *v == version) {
        println!("Found version: {}", version);
    } else if let Some(version) = versions.iter().find(|&v| v.contains(version.as_str())) {
        let version = extract_mc_version(version);
        println!("Found version: {}", version);

        let versions = get_versions("@minecraft/server");
        let server = versions.iter().find(|&v| v.contains(&version)).unwrap();
        let versions = get_versions("@minecraft/server-ui");
        // println!("Versions: {:?}", versions);
        let server_ui = versions.iter().find(|&v| v.contains(&version)).unwrap();

        println!("Server version: {}", server);
        println!("Server UI version: {}", server_ui);

    } else {
        eprintln!("Version not found: {}", version);
        std::process::exit(1);
    }
}