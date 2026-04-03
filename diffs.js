import spanishJson from './es.json' with { type: 'json' }
import englishJson from './en.json' with { type: 'json' }
import frenchJson from './fr.json' with { type: 'json' }
import polishJson from './pl.json' with { type: 'json' }
import swedishJson from './sv.json' with { type: 'json' }
import mandarinJson from './zh.json' with { type: 'json' }

function getAllKeys(languageJson, path = []) {
  return Object.keys(languageJson).reduce(function (acc, k) {
    const v = languageJson[k]
    if (typeof v === 'string') {
      acc.push([...path, k].join('.'))
    } else {
      // Note: Assumes string or object only in languageJson
      acc = acc.concat(getAllKeys(v, [...path, k]))
    }
    return acc
  }, [])
}

function getAllKeysWithValues(languageJson, path = []) {
  return Object.keys(languageJson).reduce(function (acc, k) {
    const v = languageJson[k]
    if (typeof v === 'string') {
      acc.push({ key: [...path, k].join('.'), value: v })
    } else {
      acc = acc.concat(getAllKeysWithValues(v, [...path, k]))
    }
    return acc
  }, [])
}

function compareLanguageObjects(json1, json2) {
  const json1Keys = getAllKeysWithValues(json1)
  const json2Keys = getAllKeys(json2)

  const missingKeys = json1Keys.filter((k) => !json2Keys.includes(k.key))

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing keys in translation \n${missingKeys.map((k) => `${k.key}: ${k.value}`).join('\n')}`
    )
  }

  return true
}

compareLanguageObjects(englishJson, spanishJson)
compareLanguageObjects(englishJson, swedishJson)
compareLanguageObjects(englishJson, polishJson)
compareLanguageObjects(englishJson, frenchJson)
compareLanguageObjects(englishJson, mandarinJson)
compareLanguageObjects(spanishJson, swedishJson)
compareLanguageObjects(spanishJson, polishJson)
compareLanguageObjects(spanishJson, frenchJson)
compareLanguageObjects(spanishJson, mandarinJson)
compareLanguageObjects(swedishJson, polishJson)
compareLanguageObjects(swedishJson, frenchJson)
compareLanguageObjects(swedishJson, mandarinJson)
compareLanguageObjects(polishJson, frenchJson)
compareLanguageObjects(polishJson, mandarinJson)
compareLanguageObjects(frenchJson, mandarinJson)
