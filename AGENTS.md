# AI Agent Development Guidelines & Workspace Conventions

Welcome, AI Developer! This workspace is a highly cohesive, hybrid environment combining a high-performance **Go Remote Development Gateway** and a **React+Express full-stack web application**. 

To maintain the exceptional software craftsmanship, design integrity, and performance standards of this project, you **MUST** strictly adhere to the following rules and guidelines when adding features, modifying code, or fixing bugs.

---

## 1. Scope Discipline & User Intent (CRITICAL)
- **Strict Adherence**: Treat the user's request as the absolute ceiling of functional scope. Never inject unsolicited features, visual playgrounds, extra tabs, database migrations, or API proxies unless explicitly requested.
- **Single-Screen Rule**: Simple requests (such as "todo list", "calculator") must reside on a single, perfectly crafted page without persistent sidebar navigation or bloated visual panels.
- **No System-Larping**: Never add simulated status indicators (e.g., "● ONLINE", "PING: 15ms"), mock server log lists, port telemetry readouts, or technical margin-clutter unless explicitly requested by the user.

---

## 2. Go-Gateway Development Guidelines (`/go-gateway`)
The Go-Gateway is a lightweight, low-latency utility acting as a tunnel and file synchronizer.
- **Strict Error Handling**: In Go, **never** ignore returned errors (avoid `_` unless absolutely unavoidable). Validate every file operation, directory creation, or network dial, and log failure traces with appropriate prefixes (`[-]` for errors, `[*]` for progress, `[+]` for success).
- **Standard Library Only**: Avoid introducing external heavyweight packages unless highly justified.
- **Standard Format (`gofmt`)**: Ensure indentations use true standard Tabs (`\t`) instead of multiple spaces.
- **Key SSH Protocols**:
  - Private key loading should read from the filesystem via `os.ReadFile` and parse via `ssh.ParsePrivateKey`.
  - Avoid spawning unnecessary goroutines; utilize native pipeline bindings like `session.Stdin = file` for direct streaming copy.
- **Live Watch Engine**: The filesystem observer uses a robust, lightweight polling mechanism checking directory catalogs at a steady tick (3s). If you optimize this, ensure no high CPU or memory allocations occur.

---

## 3. Full-Stack Web Development (`/src` and `/server.ts`)
The web application uses React + Vite on the client, with an Express middleware server handling APIs and static serving.
- **No Infinite Renders**: Ensure `useEffect` dependencies contain primitive values or heavily memoized references to prevent infinite redraw loops.
- **Modularity**: Do **NOT** consolidate all logic into a single file (e.g., avoid overloading `App.tsx`). Split styles, types, and auxiliary custom views cleanly into `/src/types.ts` and `/src/components/*`.
- **Icons**: Always import icons from `lucide-react`. Never generate inline SVG raw nodes.
- **Transitions**: Use `motion` from `motion/react` for any smooth entrances or route transformations.
- **Express Port & Host bindings**: Express **must** bind strictly to host `0.0.0.0` and port `3000` to support container reverse-proxy ingress routing.
- **API Proxy Isolation**: Keep all sensitive authentication keys, certificates, or tokens strictly server-side. Expose only safe proxy end-points `/api/*` to the client.

---

## 4. Environment and Deployment Setup
- **`.env.example` Declaration**: Any new environment variable introduced **must** be documented inside `.env.example` without publishing actual values/secrets.
- **CI/CD Workflows**: Maintain `.github/workflows/ci-cd.yml` with separate jobs for Go cross-compilation release binaries and Node.js web-server builds to preserve seamless delivery.
- **Metadata Management**: Do not rename the application in `metadata.json` if it already possesses a custom name. Update descriptions to trace functional evolution.

---

Maintain these principles to deliver robust, secure, and masterfully crafted features on every iteration!
