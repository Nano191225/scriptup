
// use util::{get_preview_minecraft_version};

mod utils;
mod lts;
mod stable;
mod preview;
mod manifest;
mod manual;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(version, about, flatten_help = true)]
struct Args {
    version_: Option<String>,

    #[command(subcommand)]
    subcommands: Option<Command>,
}

#[derive(Subcommand, Clone, Debug)]
enum Command {
    /// 一度に出力
    Stable {},

    /// レビュー版を対象
    Preview {},

    /// 手動でバージョンを指定
    Lts {},
}

fn main() {
    let args = Args::parse();
    
    // let args = parse_args();

    match args.subcommands {
        Some(Command::Stable {}) => {
            stable::main(args);
        }
        Some(Command::Preview {}) => {
            preview::main(args);
        }
        Some(Command::Lts {}) => {
            lts::main(args);
        }
        _ => {
            manual::main(args);
        }
    }
}

// fn parse_args() -> Vec<String> {
//     let args: Vec<String> = std::env::args().collect();
//     if args.len() < 2 {
//         eprintln!("Usage: {} <command>", args[0]);
//         std::process::exit(1);
//     }
//     args[1..].to_vec()
// }
