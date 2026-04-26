import { Global, Module } from '@nestjs/common';
import { CancelService } from './cancel.service';

@Global()
@Module({
  providers: [CancelService],
  exports: [CancelService],
})
export class SharedModule {}
