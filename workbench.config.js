export default {
  title: 'Cuebids Translation Workbench',
  description:
    'Review, compare, and edit every translation source from one place, with issue heuristics for missing and likely untranslated content.',
  referenceLanguage: 'en',
  languages: {
    en: {
      label: 'English',
      accent: '#3056d3',
    },
    sv: {
      label: 'Swedish',
      accent: '#0f8a70',
    },
    pl: {
      label: 'Polish',
      accent: '#d4661e',
    },
    fr: {
      label: 'French',
      accent: '#7b4ae2',
    },
    es: {
      label: 'Spanish',
      accent: '#ef6a3a',
    },
    zh: {
      label: 'Mandarin',
      accent: '#c9302c',
    },
  },
  datasets: [
    {
      id: 'web',
      label: 'Web Core',
      description: 'Primary shared locale bundle',
      kind: 'language-files',
      directory: '.',
      filePattern: '{lang}.json',
      languages: ['en', 'sv', 'pl', 'fr', 'es', 'zh'],
      ignorePaths: ['locale', 'lia_lang'],
    },
    {
      id: 'app',
      label: 'Web App',
      description: 'App-specific locale bundle',
      kind: 'language-files',
      directory: 'app',
      filePattern: '{lang}.json',
      languages: ['en', 'sv', 'pl', 'fr', 'es', 'zh'],
      ignorePaths: ['locale', 'lia_lang'],
    },
    {
      id: 'native',
      label: 'Native',
      description: 'Native subscription and store texts',
      kind: 'language-files',
      directory: 'native',
      filePattern: '{lang}.json',
      languages: ['en', 'sv', 'pl', 'fr', 'es', 'zh'],
    },
    {
      id: 'lia-alerts',
      label: 'Lia Alerts',
      description: 'Lia alert snippets',
      kind: 'language-files',
      directory: 'lia',
      filePattern: '{lang}/alerts.json',
      languages: ['en', 'sv', 'pl', 'fr'],
    },
    {
      id: 'notifications',
      label: 'Notifications',
      description: 'Push notification titles and bodies',
      kind: 'language-nodes',
      file: 'notifications/notifications.json',
      languages: ['en', 'sv', 'pl', 'fr'],
    },
  ],
}
