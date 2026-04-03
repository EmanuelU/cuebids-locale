# cuebids-locale

Localisation repo

## Translation Workbench

Run the local editor with:

```bash
pnpm --filter cuebids-locale run workbench
```

The workbench can:

- list, search, and filter translation rows
- compare multiple languages side by side
- edit locale JSON values and save them back to disk
- flag missing translations, placeholder mismatches, and likely untranslated words

By default it uses [`workbench.config.js`](/Users/unge/dev/sthlm-bridge/Cuebids-develop/packages/cuebids-locale/workbench.config.js).

To reuse the same tool for another app later, point it at a different config file:

```bash
TRANSLATION_WORKBENCH_CONFIG=/absolute/path/to/translation-workbench.config.js pnpm --filter cuebids-locale run workbench
```

Supported dataset adapters in the config:

- `language-files`: one JSON file per language, for example `en.json`, `sv.json`
- `language-nodes`: one JSON file that nests language codes inside entries, for example `notifications.json`
