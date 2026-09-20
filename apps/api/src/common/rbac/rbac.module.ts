import { Global, Module } from '@nestjs/common';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';

/**
 * Módulo global do RBAC.
 *
 * `CaslAbilityFactory` era `@Injectable()` mas não estava registrado em
 * nenhum módulo — funcionava por acidente porque nada o injetava. Agora que o
 * `PoliciesGuard` é um `APP_GUARD` global, a dependência precisa existir de
 * verdade no contêiner.
 */
@Global()
@Module({
  providers: [CaslAbilityFactory],
  exports: [CaslAbilityFactory],
})
export class RbacModule {}
