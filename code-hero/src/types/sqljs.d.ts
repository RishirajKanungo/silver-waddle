declare module 'sql.js/dist/sql-asm.js' {
  import type { SqlJsStatic } from 'sql.js';
  const init: (config?: unknown) => Promise<SqlJsStatic>;
  export default init;
}
