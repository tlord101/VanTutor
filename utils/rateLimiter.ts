export class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private intervalMs: number;

  constructor(maxRequests: number, intervalMs: number) {
    this.maxRequests = maxRequests;
    this.intervalMs = intervalMs;
  }

  public check(): { allowed: boolean; message: string } {
    const now = Date.now();
    
    // Filter out timestamps that are outside the interval
    this.timestamps = this.timestamps.filter(
      (timestamp) => now - timestamp < this.intervalMs
    );

    if (this.timestamps.length >= this.maxRequests) {
      const timeLeft = Math.ceil((this.intervalMs - (now - this.timestamps[0])) / 1000);
      return {
        allowed: false,
        message: `You're sending messages too quickly. Please wait ${timeLeft} seconds.`,
      };
    }

    return { allowed: true, message: '' };
  }
  
  public record(): void {
      this.timestamps.push(Date.now());
  }
  
  public updateConfig(maxRequests: number, intervalMs: number): void {
      this.maxRequests = maxRequests;
      this.intervalMs = intervalMs;
      // Reset timestamps when config changes to avoid unfair limiting
      this.timestamps = [];
  }
}
