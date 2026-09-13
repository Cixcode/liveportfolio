# Portfolio Development Log & Architecture (v2)

## 1. Live Deployment & Endpoints
- **Client Site**: `https://liveportfolio-six.vercel.app/`
- **Admin Dashboard**: `https://liveportfolio-six.vercel.app/admin.html`
- **GitHub Repository**: `https://github.com/Cixcode/liveportfolio`
- **Hosting Platform**: Vercel (Continuous Deployment linked to branch `main`)
- **Backend Database**: Supabase PostgreSQL (`liveportfolio-backend` on AWS `eu-west-1`)

---

## 2. Authentication & Security Architecture
- **OAuth Provider**: Native GitHub OAuth (no credit card or billing verification required).
  - **Supabase OAuth Callback**: `https://jryrkpkzzrvgawkmljvt.supabase.co/auth/v1/callback`
  - **Redirect Allowed URLs**: `https://liveportfolio-six.vercel.app/**`
- **Namespace Conflict Resolution**:
  - Global variable `supabase` was clashing with Supabase CDN script.
  - Resolved across `script.js` and `admin.js` by standardizing the instance name to `supabaseClient`.
- **Role-Based Navigation**:
  - Regular client sessions hide the `Admin` button on `index.html`.
  - Admin button displays dynamically only for authenticated accounts with `role === 'admin'`.

---

## 3. Production Database Schema (Supabase SQL)

```sql
-- 1. Users Directory Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    auth_provider VARCHAR(30) DEFAULT 'local' CHECK (auth_provider IN ('local', 'google', 'github')),
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('admin', 'client')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    login_count INT DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Login Audit Logs Table
CREATE TABLE IF NOT EXISTS login_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    username VARCHAR(80) NOT NULL,
    email VARCHAR(255) NOT NULL,
    auth_method VARCHAR(50) NOT NULL,
    login_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Projects Showcase Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    image_url TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Automated Login Counter Trigger
CREATE OR REPLACE FUNCTION record_user_login()
RETURNS TRIGGER AS $$ BEGIN     UPDATE users     SET login_count = login_count + 1,         last_login_at = NEW.login_timestamp     WHERE id = NEW.user_id;     RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_record_user_login ON login_audit_logs;
CREATE TRIGGER trigger_record_user_login
AFTER INSERT ON login_audit_logs
FOR EACH ROW
EXECUTE FUNCTION record_user_login();
