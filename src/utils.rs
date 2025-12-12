use std::process::Command;
// use std::fs;


pub fn run_npm(args: &[&str]) -> Result<String, String> {
    let output = Command::new("npm.cmd")
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute npm command: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|e| format!("Failed to parse output: {}", e))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn get_versions(package: &str) -> Vec<String> {
    let result = run_npm(&["view", package, "versions", "--json"]);

    match result {
        Ok(output) => {
            let mut versions: Vec<String> = serde_json::from_str::<Vec<String>>(&output).unwrap();
            versions.reverse();
            
            versions.sort_by_key(|v| {
                 if v.contains("stable") {
                    0
                } else if v.contains("preview") {
                    1
                } else {
                    2
                }
            });
            versions
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }
}

pub fn extract_mc_version(version: &str) -> String {
    let start = version.find("-").unwrap_or(0);
    let start = version[start..].find(".").unwrap_or(0) + start + 1;
    let end = version[start..].find("-").unwrap_or(version.len());
    version[start..start + end].to_string()
}

pub fn extract_module_version(version: &str) -> String {
    let start = version.find("-").unwrap_or(0);
    let end = version[start..].find(".").unwrap_or(0) + start;
    version[..end].to_string()
}


// pub fn get_preview_minecraft_version() -> String {
//     let versions = get_versions();
//     let version = versions.iter().find(|&v| v.contains("-preview."));

//     if let Some(version) = version {
//         version.to_string()
//     } else {
//         eprintln!("No preview versions found.");
//         std::process::exit(1);
//     }
// }