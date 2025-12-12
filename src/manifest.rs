// use serde_json::Value;
use std::fs;

use serde::{Deserialize, Serialize};
use serde_json::Number;

#[derive(Serialize, Deserialize, Debug)]
pub struct Manifest {
    pub format_version: Number,
    pub header: Header,
    pub metadata: Metadata,
    pub modules: Vec<Module>,
    pub dependencies: Vec<Dependency>,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Header {
    pub name: String,
    pub description: String,
    pub uuid: String,
    pub version: Vec<Number>,
    pub min_engine_version: Vec<Number>,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Metadata {
    pub authors: Vec<String>,
    pub url: String,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Module {
    #[serde(rename = "type")]
    pub r#type: String,
    pub uuid: String,
    pub version: Vec<Number>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Dependency {
    pub module_name: String,
    pub version: String,
}

pub fn get_manifest() -> Manifest {
    let raw = fs::read_to_string("manifest.json").unwrap_or_else(|_| {
        eprintln!("Error: manifest.json not found.");
        std::process::exit(1);
    });

    let manifest: Manifest = serde_json::from_str(&raw).unwrap();

    manifest
}

pub fn update_manifest(manifest: &Manifest) {
    let mut fmt = jsonxf::Formatter::pretty_printer();
    fmt.indent = "\t".to_string();
    let raw = fmt.format(serde_json::to_string(&manifest).unwrap().as_str()).unwrap();

    fs::write("manifest.json", raw).unwrap_or_else(|_| {
        eprintln!("Error: Failed to write manifest.json.");
        std::process::exit(1);
    });
}