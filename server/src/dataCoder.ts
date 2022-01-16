/*
According to this issue https://github.com/heroiclabs/nakama-js/issues/54
and corresponding solution https://github.com/heroiclabs/nakama-js/pull/56

Also see https://stackoverflow.com/a/30106551
*/

function decodeMessageData<T>(data: string): T | undefined {
  try {
    return JSON.parse(
      decodeURIComponent(
        data
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      )
    ) as T;
  } catch (error) {
    return undefined;
  }
}

// https://github.com/dop251/goja/issues/283
function encodeMessageData<T>(data: T): string | undefined {
  try {
    const urlEnc = encodeURIComponent(JSON.stringify(data)); /*.replace(
            /%([0-9A-F]{2})/g,
            (_match:string, p1) => String.fromCharCode(Number('0x' + p1))
        )*/
    return customReplace(urlEnc);
  } catch (error) {
    return undefined;
  }
}

function customReplace(urlEncoded: string): string {
  let s = "";
  for (let i = 0; i < urlEncoded.length; ++i) {
    const char = urlEncoded.charAt(i);
    if (char === "%") {
      s += String.fromCharCode(Number("0x" + urlEncoded.substr(i + 1, 2)));
      i += 2;
    } else {
      s += char;
    }
  }
  return s;
}
