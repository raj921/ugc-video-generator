export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export function assertServerConfig(): void {
  requiredEnv("PEXELS_API_KEY");
  requiredEnv("GIPHY_API_KEY");
  requiredEnv("CREATOMATE_API_KEY");
}
