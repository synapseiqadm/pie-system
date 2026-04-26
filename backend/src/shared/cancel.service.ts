import { Injectable, Global } from '@nestjs/common';

@Global()
@Injectable()
export class CancelService {
  private readonly flags = new Set<string>();

  request(key: string) { this.flags.add(key); }
  isCancelled(key: string) { return this.flags.has(key); }
  clear(key: string) { this.flags.delete(key); }
}
