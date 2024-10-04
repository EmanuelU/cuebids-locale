import englishJson from './en.json' with { type: 'json' }
import polishJson from './pl.json' with { type: 'json' }

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

compareLanguageObjects(englishJson, polishJson)
