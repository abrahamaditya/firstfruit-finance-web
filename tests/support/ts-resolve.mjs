// Node menjalankan .ts lewat type stripping, tetapi tidak menebak ekstensi impor relatif.
// Kode domain memakai impor tanpa ekstensi (gaya bundler), jadi tes mencoba `.ts`.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && relative && !/\.[cm]?[jt]s$/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
