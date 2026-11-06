import sql from 'mssql';

// Coordinates verified with connector discovery and SELECT DB_NAME().
const server = 'x6eps4xrq2xudenlfv6naeo3i4-x56xuxzcvvxutldkip4ifftypy.msit-database.fabric.microsoft.com';
const database = 'rayfin-builder-static-e2e-20261028-c1-d3b9da46-5d73-4e13-80b4-ceb2f554d5b3';
export async function withSql<T>(token: string, run: (pool: sql.ConnectionPool) => Promise<T>): Promise<T> {
  const pool = new sql.ConnectionPool({
    server, database, connectionTimeout: 15000, requestTimeout: 20000,
    options: { encrypt: true, trustServerCertificate: false },
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    pool: { max: 2, min: 0 },
  });
  try {
    await pool.connect();
    return await run(pool);
  } finally { await pool.close(); }
}
export async function withOperationsLock<T>(token: string, run: () => Promise<T>): Promise<T> {
  return withSql(token, async pool => {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Serializes this app's read/validate/write workflows across function instances.
      await transaction.request().query(`
        DECLARE @result int;
        EXEC @result = sys.sp_getapplock @Resource = N'Fieldwork:3b048fa9-5313-4713-8705-63f17483b9ea',
          @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @result < 0 THROW 50009, 'The workspace is busy. Retry shortly.', 1;`);
      const result = await run();
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  });
}
export { sql };
