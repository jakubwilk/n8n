# FORK.md: zasady pracy w forku jakubwilk/n8n

To repozytorium jest **forkiem n8n** (`n8n-io/n8n`) używanym do budowania własnych obrazów n8n dla serwera produkcyjnego (Coolify). Instrukcje upstream są w `AGENTS.md`. Ten plik opisuje to, co jest specyficzne dla forka, i ma pierwszeństwo przed `AGENTS.md` we wszystkim, co dotyczy gałęzi, synchronizacji i wydań.

Komunikacja z właścicielem repozytorium: po polsku.

## Najważniejsze zasady

1. **Na produkcję trafia wyłącznie stabilny kod n8n**, czyli wydanie wskazywane przez upstreamowy tag `stable` (np. `n8n@2.47.4`). Nigdy nie merguj upstreamowego `master` (ani `master` forka) do `dev` ani `build`. `master` n8n to niewydany kod deweloperski.
2. **Wszystkie zmiany idą przez pull requesty na GitHubie.** Nie rób lokalnego `git merge` do `dev` ani `build` z pushem. Pracujesz na gałęzi, robisz push i otwierasz PR.
3. **Bez force-pushy na `dev` i `build`**, chyba że właściciel wprost o to poprosi.
4. **Scalenie PR do `build` = wdrożenie na produkcję.** Workflow buduje obrazy i sam aktualizuje n8n w Coolify. Nie scalaj niczego do `build` bez wyraźnej zgody właściciela. Nie łącz się z serwerem ani z API Coolify z tego repozytorium. Dokumentacja serwera jest w osobnym projekcie (`D:\04.devops\ovh`).

## Gałęzie

| Gałąź | Rola | Skąd przychodzą zmiany |
|---|---|---|
| `master` | lustro upstream `master` (przycisk „Sync fork”) | tylko z upstream. Nic z niej nie budujemy ani nie mergujemy dalej |
| `dev` | **gałąź domyślna**: stabilny tag upstream + własne zmiany | PR z gałęzi funkcji (squash) i PR z tagiem upstream (merge commit) |
| `build` | wersja produkcyjna. Push uruchamia build obrazów **i automatyczne wdrożenie** | tylko PR `dev` → `build` (squash) |

**Nigdy nie klikaj „Sync fork” na `dev` ani `build`.** Przycisk porównuje je z upstreamowym `master` i wciągnąłby niewydany kod. „Sync fork” tylko na `master`, albo `gh repo sync jakubwilk/n8n -b master`. Komunikat „X commits ahead, Y behind n8n-io/n8n:master” przy `dev` jest normalny.

Remote `upstream` = `https://github.com/n8n-io/n8n.git` (dodaj go, jeśli go nie ma: `git remote add upstream https://github.com/n8n-io/n8n.git`).

## Metody scalania PR (ważne)

| PR | Metoda | Dlaczego |
|---|---|---|
| gałąź funkcji → `dev` | **Squash and merge** | czysta historia własnych zmian |
| tag upstream (`upstream/n8n-X.Y.Z`) → `dev` | **Create a merge commit** | squash zgubiłby historię upstream. Przy następnych aktualizacjach git porównywałby wszystko od starego wydania i konfliktów byłoby coraz więcej |
| `dev` → `build` | **Squash and merge** | jeden commit na wydanie produkcyjne |

Przed PR `dev` → `build` gałąź `build` musi być wciągnięta do `dev`. Jeśli GitHub pokaże konflikt w PR, użyj **Resolve conflicts** i zostaw wersję z `dev`, bo `dev` zawiera wszystko, co ma `build`.

## Aktualizacja n8n do nowego stabilnego wydania

Workflow `.github/workflows/upstream-stable-check.yml` raz dziennie sprawdza upstreamowy tag `stable`. Jeśli wskazuje wydanie, którego nie ma w `dev`, zakłada issue „Nowe stabilne wydanie n8n: n8n@X.Y.Z”. Sam niczego nie merguje.

Procedura (właściciel albo Claude na prośbę właściciela):

```bash
# 1. Pobierz tagi upstream. --force, bo tag `stable` jest przesuwany przez upstream.
git fetch upstream --tags --force

# 2. Ustal wydanie wskazywane przez `stable`
git tag --points-at "stable^{commit}" | grep -E '^n8n@[0-9]+\.[0-9]+\.[0-9]+$'
#    -> np. n8n@2.48.2 (dalej: X.Y.Z)

# 3. Sprawdź, czy dev już go nie zawiera (wynik "zawiera" = nic do zrobienia)
git fetch origin
git merge-base --is-ancestor "n8n@X.Y.Z^{commit}" origin/dev && echo zawiera || echo brak

# 4. Gałąź aktualizacji z dev i merge tagu
git checkout -b upstream/n8n-X.Y.Z origin/dev
git merge --no-ff "n8n@X.Y.Z" -m "chore: merge n8n@X.Y.Z (stable) into dev"
#    Konflikty: w plikach upstream bierz wersję upstream, chyba że plik zawiera własną
#    zmianę z dev. Własne pliki forka (FORK.md, linia @FORK.md w CLAUDE.md,
#    .github/workflows/build-coolify-images.yml, .github/workflows/upstream-stable-check.yml)
#    zawsze zachowaj.

# 5. Push i PR do dev, scalany przez "Create a merge commit"
git push -u origin upstream/n8n-X.Y.Z
```

Po scaleniu:
- Zamknij issue z kroku automatycznego.
- **Wyłącz nowe workflowy upstream.** Merge tagu może dodać nowe pliki w `.github/workflows/`, które w forku będą domyślnie włączone (PowerShell):
  ```powershell
  (gh workflow list -R jakubwilk/n8n --all --limit 300 --json id,name,path,state | ConvertFrom-Json) |
    Where-Object { $_.state -eq 'active' -and $_.path -notmatch 'build-coolify-images|upstream-stable-check' } |
    ForEach-Object { gh workflow disable $_.id -R jakubwilk/n8n }
  ```
  Aktywne mają zostać tylko `Build Coolify images` i `Upstream stable check`.

## Własne zmiany w n8n

1. `git checkout -b feature/<nazwa> origin/dev`
2. Zmiany, commity. Jeśli na `dev` coś doszło w międzyczasie, wciągnij `dev` do swojej gałęzi.
3. `git push -u origin feature/<nazwa>` → PR do `dev` → **Squash and merge**.

Własne zmiany trzymaj możliwie małe i odseparowane od kodu upstream, bo każda aktualizacja n8n może dać w nich konflikt.

## Build obrazów

- Workflow `.github/workflows/build-coolify-images.yml` uruchamia się przy pushu na `build` (czyli po scaleniu PR `dev` → `build`) albo ręcznie (`workflow_dispatch`).
- Robi `pnpm install --frozen-lockfile --trust-lockfile`, potem `pnpm build:docker` (`scripts/build-n8n.mjs` + `scripts/dockerize-n8n.mjs`, cele `n8n` i `runners` z `docker/docker-bake.hcl`) dla `linux/amd64`, i wypycha do GHCR:
  - `ghcr.io/jakubwilk/n8n:<wersja>-<sha7>`
  - `ghcr.io/jakubwilk/n8n-runners:<wersja>-<sha7>`
  - `<wersja>` pochodzi z `packages/cli/package.json`, `<sha7>` to 7 znaków SHA commita na `build`. Pakiety GHCR są publiczne.
  - oba obrazy dostają też ruchomy tag **`prod`**, którego używa produkcja.
- **Obrazy `n8n` i `n8n-runners` muszą mieć ten sam tag** (wymaganie n8n). Oba powstają w jednym przebiegu.
- Wszystkie pozostałe workflowy upstream są w forku wyłączone. Nie włączaj ich.

## Wdrożenie (automatyczne)

Po buildzie z gałęzi `build` ten sam workflow:
1. wywołuje deploy usługi n8n w Coolify (`POST /api/v1/deploy?uuid=0gd7ymn3h6oyfxjycxsdghwg`, token z sekretu `COOLIFY_TOKEN`; bez sekretu krok jest pomijany),
2. czeka na `https://ai-automation.underwolfstudio.com/healthz`. Brak odpowiedzi kończy przebieg błędem.

Po stronie serwera restart usługi zaczyna się od kontenera `db-backup`, który robi zrzut bazy. Dopiero potem startują n8n i worker z nowymi obrazami `:prod`. Migracje bazy n8n są jednokierunkowe, a zrzut pozwala wrócić.

Środowisko produkcyjne: n8n w queue mode (main + worker, każdy z runnerem), Redis, PostgreSQL 16. **Nowa wersja nie może być starsza niż ta, która działa.** Nigdy nie cofaj `build` do starszego wydania n8n, bo wdrożyłoby się automatycznie na bazę po nowszej migracji.
