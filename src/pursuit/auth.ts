import { PursuitReadError } from "./errors.js";
export interface TokenSource {
  getToken(): string;
}
export class EnvironmentTokenSource implements TokenSource {
  getToken(): string {
    const token = process.env.PURSUIT_TOKEN?.trim();
    if (!token || token === "your_token_here" || /[\s\r\n]/.test(token))
      throw new PursuitReadError("CONFIG");
    return token;
  }
}
