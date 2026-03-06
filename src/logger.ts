type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  constructor(private readonly context: string) {}

  private log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString().slice(0, 19);
    console.log(`${timestamp} [${this.context}] [${level}] ${message}`);
  }

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string): void {
    this.log("error", message);
  }
}
