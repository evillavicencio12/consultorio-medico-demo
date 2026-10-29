// tests/hook-busqueda-recursiva.test.ts
//
// El hook PreToolUse que bloquea búsquedas recursivas y la lectura de .env por
// la terminal (.claude/hooks/bloquear-busqueda-recursiva.mjs). Ver
// docs/arquitectura/Trampas-Recurrentes.md.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { motivoDeBloqueo } from "../.claude/hooks/bloquear-busqueda-recursiva.mjs";

const HOOK = ".claude/hooks/bloquear-busqueda-recursiva.mjs";

// Por la herramienta Bash.
const BLOQUEA: string[] = [
  // grep recursivo, en cualquier grafía
  'grep -r "algo" scripts',
  'grep -rn "x" .',
  "grep -R x .",
  "grep --recursive x .",
  "grep -inr x src",
  "grep -lr x .",
  'grep "x" -r .',
  'grep -E "a|b" -r .',
  "egrep -r x .",
  "fgrep -r x .",
  "grep -d recurse x .",
  "grep --directories=recurse x .",
  "grep --dereference-recursive x .",
  "grep -Hrn SUPABASE .",
  "grep -Er 'KEY|PASS' .",
  "grep -wr x .",
  "grep -rC2 PASS .",
  "grep -rm1 PASS .",
  "grep -nrC2 PASS .",
  "GREP -r PASS .",
  "grep.exe -r PASS .",
  "grep '-r' PASS .",
  "grep -A3 -r x .",
  'cd "/c/repo" && grep -rn "itl" --exclude-dir=node_modules . | head',
  'bash -c "grep -r x ."',
  // git grep fuera de lo versionado
  "git grep --no-index PASS",
  "git grep --untracked --no-exclude-standard PASS",
  // rg que no respeta .gitignore
  "rg --no-ignore x",
  "rg -uu x",
  "rg -u x .",
  "rg -u -u x",
  "rg.exe -uu PASS",
  "rg --unrestricted x",
  "rg --hidden -g '.env' PASSWORD",
  'rg --glob=".env*" x',
  "rg --hidden -g '*' PASS",
  "rg --hidden -g '*env*' PASS",
  "rg -g '*.ts' x",
  // .env como argumento o glob de la shell
  "grep SUPABASE .env",
  "grep -n x ./.env.produccion",
  "grep PASS .env*",
  "grep PASS * .*",
  "rg x .env",
  "cat .env",
  "head -3 .env",
  "type .env",
  "sed -n 1p .env",
  // findstr /s
  "findstr /s secreto *",
  "findstr /S /I x *.txt",
  "findstr /si x *",
  "cmd //c findstr //s x *",
  "cmd /c findstr /s x *",
  "findstr -s PASS *",
  // find y xargs que leen contenido
  'find . -name "*.ts" -exec grep -l x {} +',
  "find . -type f -exec cat {} ;",
  "find . | xargs grep x",
  "find . -type f -print0 | xargs -0 grep PASSWORD",
  "find . | xargs -I{} grep x {}",
  "find . -execdir egrep x {} +",
  "find . -name '.env*' -exec cat {} +",
  "ls | xargs cat",
  "find . -type f -exec sh -c 'grep PASS \"$1\"' _ {} \\;",
  "grep PASS $(find . -type f)",
  "cat `find . -name '*.txt'`",
  // PowerShell anidado en Bash
  'powershell -Command "Get-ChildItem -Recurse | Select-String x"',
  'powershell -Command "gci -r | sls x"',
  'pwsh -c "Get-ChildItem . -Recurse -File | Get-Content"',
  'powershell -Command "Select-String -Path * -Pattern x -Recurse"',
  "Get-ChildItem -Recurse | Select-String PASSWORD",
  "gci -Recurse | sls SUPABASE_DB_URL",
  "get-childitem -recurse | select-string x",
  "dir -r | Get-Content",
  'powershell -Command "Get-Content .env"',
];

// Por la herramienta PowerShell.
const BLOQUEA_POWERSHELL: string[] = [
  "gci -Recu | sls PASS",
  "ls -Recurse | sls PASS",
  "gci -Depth 9 | sls PASS",
  "$f = gci -r; $f | sls PASS",
  "Get-Content .env",
  "gc .env",
  "sls PASS .env",
  "Select-String -Pattern PASS -Path .env.produccion",
  "Get-ChildItem -Recurse | Select-String x",
];

const DEJA_PASAR: string[] = [
  "git grep -n x",
  "git grep -r x",
  'git -C "/c/repo" grep x',
  'git -C "/c/repo" grep -r x',
  'cd /c/repo && git grep "x" -- scripts',
  "grep -n x scripts/entorno.mjs",
  "grep -c algo scripts/entorno.mjs",
  'grep -E "error|warn" archivo.log',
  'grep ".*" archivo.log',
  'grep -E ".*x" archivo.log',
  "grep --color=never -n x archivo",
  "grep -n x .env.example",
  'grep "process.env" lib/entorno.ts',
  "git diff --cached | grep -c '^+'",
  "rg x scripts",
  "rg --hidden x",
  "rg -U x scripts",
  "rg -g '!*.lock' x",
  "findstr x //c/datos/archivo.txt",
  "findstr x archivo.txt",
  'find . -name "*.ts"',
  "find . -type f | wc -l",
  "ls -R scripts",
  "ls -r",
  "sort -r archivo",
  "cat package.json",
  "grep x $(git ls-files scripts)",
  "find . -name '*.ts' -exec wc -l {} +",
  "sed -n 1p .env.example",
  "git log --oneline -3",
  'powershell -Command "Get-ChildItem -Recurse"',
  'powershell -Command "Get-Content archivo.txt | Select-String x"',
  "npm run test",
  "",
];

const DEJA_PASAR_POWERSHELL: string[] = [
  "Get-ChildItem -Recurse",
  "ls",
  "Get-Content package.json | Select-String version",
  "Get-Content .env.example",
  "git grep -n x",
];

describe("hook de búsquedas recursivas", () => {
  it.each(BLOQUEA)("Bash, bloquea: %s", (comando) => {
    expect(motivoDeBloqueo(comando, "Bash")).not.toBeNull();
  });

  it.each(BLOQUEA_POWERSHELL)("PowerShell, bloquea: %s", (comando) => {
    expect(motivoDeBloqueo(comando, "PowerShell")).not.toBeNull();
  });

  it.each(DEJA_PASAR)("Bash, deja pasar: %s", (comando) => {
    expect(motivoDeBloqueo(comando, "Bash")).toBeNull();
  });

  it.each(DEJA_PASAR_POWERSHELL)("PowerShell, deja pasar: %s", (comando) => {
    expect(motivoDeBloqueo(comando, "PowerShell")).toBeNull();
  });

  it("como hook: sale con 2 y el motivo en stderr (Bash y PowerShell); con 0 si es otra herramienta o no hay nada que bloquear; con 1 y un aviso si el hook falla", () => {
    const correr = (entrada: string) => spawnSync(process.execPath, [HOOK], { input: entrada, encoding: "utf8" });
    const bloqueado = correr(JSON.stringify({ tool_name: "Bash", tool_input: { command: 'grep -r "algo" scripts' } }));
    expect(bloqueado.status).toBe(2);
    expect(bloqueado.stderr).toContain("grep recursivo");
    expect(bloqueado.stderr).toContain("herramienta Grep");

    const permitido = correr(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git grep -n x" } }));
    expect([permitido.status, permitido.stderr]).toEqual([0, ""]);
    const ps = correr(JSON.stringify({ tool_name: "PowerShell", tool_input: { command: "ls -Recurse | sls KEY" } }));
    expect(ps.status).toBe(2);
    expect(correr(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } })).status).toBe(0);

    // Un error propio del hook: avisa de forma visible y no bloquea (1, no 2).
    const caido = correr("no es json");
    expect(caido.status).toBe(1);
    expect(caido.stderr).toContain("está caído");
  });
});
