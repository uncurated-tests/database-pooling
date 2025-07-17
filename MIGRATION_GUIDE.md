# Migration Guide: Supabase to PostgreSQL with Connection Pooling

This project has been migrated from using Supabase client to direct PostgreSQL connections with connection pooling using the `pg` package.

## Changes Made

### 1. Dependencies
- Removed: `@supabase/supabase-js`
- Added: `pg` and `@types/pg`

### 2. Database Connection
- Created `/lib/db.ts` with connection pool configuration
- Removed `/lib/supabase.ts`
- The connection pool provides better performance and resource management for serverless environments

### 3. API Routes Updated
- `/app/api/users/route.ts` - Now uses raw SQL queries with parameterized statements
- `/app/api/benchmark/route.ts` - Updated for performance testing with pg

### 4. Environment Variables
You need to update your environment variables. Create a `.env.local` file with:

```env
# Option 1: Use a connection string (recommended)
DATABASE_URL=postgres://username:password@host:5432/database_name

# Option 2: Use individual parameters
# PGHOST=localhost
# PGPORT=5432
# PGDATABASE=your_database_name
# PGUSER=your_username
# PGPASSWORD=your_password
```

If migrating from Supabase, you can find your direct connection string in:
Supabase Dashboard > Settings > Database > Connection string (Direct connection)

### 5. Connection Pool Configuration
The connection pool in `/lib/db.ts` is configured with:
- Max connections: 20
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds

These values can be adjusted based on your needs.

## Benefits of This Migration

1. **Better Performance**: Direct PostgreSQL connections are faster than going through Supabase's API layer
2. **Connection Pooling**: Reuses database connections, reducing overhead in serverless environments
3. **More Control**: Direct access to PostgreSQL features and optimizations
4. **Cost Effective**: No additional API layer overhead

## Testing

After setting up your environment variables, test the endpoints:

1. GET `/api/users` - Fetches the latest 10 users
2. POST `/api/users` - Creates a new user (requires `name` and `email` in body)
3. GET `/api/benchmark` - Simple query for performance testing

## Notes

- All queries use parameterized statements to prevent SQL injection
- The connection pool automatically manages connection lifecycle
- Errors are properly caught and logged
- The pool will automatically reconnect if connections are dropped