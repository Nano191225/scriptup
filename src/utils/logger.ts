import chalk from "chalk";

export function info(message: string): void {
    console.log(`${chalk.blue("[INFO]")} ${message}`);
}

export function log(message: string): void {
    console.log(`${chalk.gray("[LOG]")} ${message}`);
}

export function warn(message: string): void {
    console.log(`${chalk.yellow("[WARN]")} ${message}`);
}

export function error(message: string): void {
    console.error(`${chalk.red("[ERROR]")} ${message}`);
}

export function done(message: string): void {
    console.log(`${chalk.green("[DONE]")} ${message}`);
}
