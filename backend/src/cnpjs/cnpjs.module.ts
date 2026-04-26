import { Module } from '@nestjs/common';
import { CnpjsService } from './cnpjs.service';
import { CnpjsController } from './cnpjs.controller';

@Module({
  controllers: [CnpjsController],
  providers: [CnpjsService],
})
export class CnpjsModule {}
