import type { RepairSampleFile } from './types.js';

/**
 * Versioned, non-sensitive sample bytes for the attachment module.
 *
 * The bytes live in source so a clean installation reproduces them; the sample-file provider
 * writes them into the configured disk at startup, and the seed creates the matching file
 * records and business links. The seed declares the same metadata inline (it is loaded by a
 * plain ESM loader that cannot follow this module); tests/logic/repair-seed.test.ts keeps the
 * two lists identical.
 */
export const REPAIR_SAMPLE_FILES: readonly RepairSampleFile[] = [
  {
    id: '2f7a1c90-5d3e-4c8a-9b11-0a1b2c3d4e01',
    key: 'repair-samples/2f7a1c90-5d3e-4c8a-9b11-0a1b2c3d4e01.png',
    filename: '现场照片-渗水-01.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 752,
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAWgAAADwCAIAAACixWkYAAACt0lEQVR42u3UR04CABRFUVZuQ+x1pIKxYHc70hWxr8MV/IQ3JSc5K7iD2/h7PgaINCQAjAMwDsA4AOMAjAPAOADjAIwDMA7AOACKcfw+HQFEjAMwDsA4AOMAjAMwDgDjAIwDMA7AOADjAKjG8fN4CBAxDsA4AOMAjAMwDsA4AIwDMA7AOADjAIwDoBrH98MBQMQ4AOMAjAMwDsA4AOMAMA7AOADjAIwDMA6Aahxf9/sAEeMAjAMwDsA4AOMAjAPAOADjAIwDMA7AOACqcXze7QFEjAMwDsA4AOMAjAMwDgDjAIwDMA7AOADjAKjG8XG7CxAxDsA4AOMAjAMwDsA4AIwDMA7AOADjAIwDoBrH7GYHIGIcgHEAxgEYB2AcgHEAGAdgHIBxAMYBGAdANY737jZAxDgA4wCMAzAOwDgA4wAwDsA4AOMAjAMwDoBqHNPrLYCIcQDGARgHYByAcQDGAWAcgHEAxgEYB2AcANU43q42ASLGARgHYByAcQDGARgHgHEAxgEYB2AcgHEAVON4vdwAiBgHYByAcQDGARgHYBwAxgEYB2AcgHEAxgFQjWNy0QKIGAdgHIBxAMYBGAdgHADzjWPSAogYB2AcgHEAxgEsxDjG43WAiHEAxgEYB2AcgHEAxgFgHIBxAMYBGAdgHADVOEajJkDEOADjAIwDMA7AOADjAJhvHOdNgIhxAMYBGAdgHMBCjGPYWQOIGAdgHIBxAMYBGAdgHADGARgHYByAcQDGAVCNY9BeBYgYB2AcgHEAxgEYB2AcAMYBGAdgHIBxAMYBUI2jf7YCEDEOwDgA4wCMAzAOwDgAjAMwDsA4AOMAjAOgGkfvdBkgYhyAcQDGARgHYByAcQAYB2AcgHEAxgEYB0A1jpeTJYCIcQDGARgHYByAcQDGAWAcgHEAxgEYB2AcAIV/VPAAIAf8p3UAAAAASUVORK5CYII=',
  },
  {
    id: '3a8b2da1-6e4f-4d9b-ac22-1b2c3d4e5f02',
    key: 'repair-samples/3a8b2da1-6e4f-4d9b-ac22-1b2c3d4e5f02.png',
    filename: '维修完成照片-02.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 1208,
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAWgAAADwCAIAAACixWkYAAAEf0lEQVR42u3YwQmAMBREwZSYNuzFNizCNqzIs7fNHgLCwL8PbOAhjuN6nHNu6YYJnHNlOOZ5bz4ul/tfVzi4XK5wcLlc4eByucLhgblc4TA0lyschuZyucLB5XKFg8vlCgeXyxUOQ3O5wmFoLpcrHFwuVzi4XK5wcLlc4TA0lyschuZyucLB5XKFg8vlCgeXyxUOQ3O5wmFoLlc4DM3lcoWDy+UKB5fLFQ4PzOUKh6G5XOEwNJfLFQ4ulyscXC5XOLhcrnAYmssVDkNzuVzh4HK5wsHlcoWDy+UKh6G5XOEwNJfL/YbDOefyEw7nXBsOn3ZcLtc/Di6XKxxcLlc4PDCXKxyG5nKFw9BcLlc4uFyucHC5XOHgcrnCYWguVzgMzeVyhYPL5QoHl8sVDi6XKxyG5nKFw9BcLlc4uFyucHC5XOHgcrnC4YG5XOEwNJcrHIbmcrnCweVyhYPL5QoHl8sVDkNzucJhaC6XKxxcLlc4uFyucHC5XOEwNJcrHIbmcrnCweVyhYPL5QoHl8sVDkNzucJhaC6XKxxcLrcNh3PO5Scczrk2HD7tuFyufxxcLlc4uFyucHhgLlc4DM3lCoehuVyucHC5XOHgcrnCweVyhcPQXK5wGJrL5QoHl8sVDi6XKxxcLlc4DM3lCoehuVyucHC5XOHgcrnCweVyhcMDc7nCYWguVzgMzeVyhYPL5QoHl8sVDi6XKxyG5nKFw9BcLlc4uFyucHC5XOHgcrnCYWguVzgMzeVyhYPL5QoHl8sVDi6XKxyG5nKFw9BcLlc4uFxuGw7nnMtPOJxzbTh82nG5XP84uFyucHC5XOHwwFyucBiayxUOQ3O5XOHgcrnCweVyhYPL5QqHoblc4TA0l8sVDi6XKxxcLlc4uFyucBiayxUOQ3O5XOHgcrnCweVyhYPL5QqHB+ZyhcPQXK5wGJrL5QoHl8sVDi6XKxxcLlc4DM3lCoehuVyucHC5XOHgcrnCweVyhcPQXK5wGJrL5QoHl8sVDi6XKxxcLlc4DM3lCoehuVyucHC53DYczjmXn3A459pw+LTjcrn+cXC5XOHgcrnC4YG5XOEwNJcrHIbmcrnCweVyhYPL5QoHl8sVDkNzucJhaC6XKxxcLlc4uFyucHC5XOEwNJcrHIbmcrnCweVyhYPL5QoHl8sVDg/M5QqHoblc4TA0l8sVDi6XKxxcLlc4uFyucBiayxUOQ3O5XOHgcrnCweVyhYPL5QqHoblc4TA0l8sVDi6XKxxcLlc4uFyucBiayxUOQ3O5XOHgcrltOJxzLj/hcM614fBpx+Vy/ePgcrnCweVyhcMDc7nCYWguVzgMzeVyhYPL5QoHl8sVDi6XKxyG5nKFw9BcLlc4uFyucHC5XOHgcrnCYWguVzgMzeVyhYPL5QoHl8sVDi6XKxwemMsVDkNzucJhaC6XKxxcLlc4uFyucHC5XOEwNJcrHIbmcrnCweVyhYPL5QoHl8sVDkNzucJhaC6XKxxcLlc4uFyucHC5XOEwNJcrHIbmcrnCweVyl+8F59mzSi/XSF8AAAAASUVORK5CYII=',
  },
  {
    id: '4b9c3eb2-7f50-4eac-bd33-2c3d4e5f6a03',
    key: 'repair-samples/4b9c3eb2-7f50-4eac-bd33-2c3d4e5f6a03.pdf',
    filename: '维修检测报告-三页.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    size: 1328,
    base64:
      'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFs0IDAgUiA2IDAgUiA4IDAgUl0gL0NvdW50IDMgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago0IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMyAwIFIgPj4gPj4gL0NvbnRlbnRzIDUgMCBSID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMTA3ID4+CnN0cmVhbQpCVCAvRjEgMTYgVGYgNTAgNzAwIFRkIChSZXBhaXIgaW5zcGVjdGlvbiByZXBvcnQgLSBQYWdlIDEgb2YgMyBcbiBXYXRlciBsZWFrIHVuZGVyIHRoZSBzaW5rIGNhYmluZXQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjYgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSAzIDAgUiA+PiA+PiAvQ29udGVudHMgNyAwIFIgPj4KZW5kb2JqCjcgMCBvYmoKPDwgL0xlbmd0aCAxMTUgPj4Kc3RyZWFtCkJUIC9GMSAxNiBUZiA1MCA3MDAgVGQgKFJlcGFpciBpbnNwZWN0aW9uIHJlcG9ydCAtIFBhZ2UgMiBvZiAzIFxuIFBpcGUgam9pbnQgcmVwbGFjZWQsIHByZXNzdXJlIHRlc3QgcGFzc2VkLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago4IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMyAwIFIgPj4gPj4gL0NvbnRlbnRzIDkgMCBSID4+CmVuZG9iago5IDAgb2JqCjw8IC9MZW5ndGggMTEyID4+CnN0cmVhbQpCVCAvRjEgMTYgVGYgNTAgNzAwIFRkIChSZXBhaXIgaW5zcGVjdGlvbiByZXBvcnQgLSBQYWdlIDMgb2YgMyBcbiBGaW5hbCBjaGVjayBjb21wbGV0ZWQgYW5kIGFyZWEgY2xlYW5lZC4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMjcgMDAwMDAgbiAKMDAwMDAwMDE5NyAwMDAwMCBuIAowMDAwMDAwMzIzIDAwMDAwIG4gCjAwMDAwMDA0ODEgMDAwMDAgbiAKMDAwMDAwMDYwNyAwMDAwMCBuIAowMDAwMDAwNzczIDAwMDAwIG4gCjAwMDAwMDA4OTkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSAxMCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTA2MgolJUVPRgo=',
  },
  {
    id: '5cad4fc3-8a61-4fbd-ce44-3d4e5f6a7b04',
    key: 'repair-samples/5cad4fc3-8a61-4fbd-ce44-3d4e5f6a7b04.txt',
    filename: '设备说明-中文样例.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    size: 335,
    base64:
      '54mp5Lia5oql5L+u57O757uf5qC35L6L6K+05piO5paH5Lu2Cgrov5nmmK/kuIDku73kuK3mlocgVVRGLTgg5paH5pys5qC35L6L77yM55So5LqO6aqM6K+B5paH5pys6aKE6KeI5Y+v5Lul5q2j5bi46K+75Y+W5bm25oyJ5Y6f5paH5pi+56S644CCCuiuvuWkh+WQjeensO+8muWcsOS4i+i9puW6k+aOkuawtOaztQrkvY3nva7vvJpCIOagi+WcsOS4i+S4gOWxggrmo4Dmn6Xnu5PorrrvvJrmjpLmsLTms7Xov5DooYzmraPluLjvvIzml6DlvILlk43vvIznu53nvJjnlLXpmLvlkIjmoLzjgIIKCuivt+WLv+WcqOatpOaWh+S7tuS4reaUvuWFpeS7u+S9leecn+WunuS4quS6uuS/oeaBr+OAggo=',
  },
  {
    id: '6dbe50d4-9b72-40ce-df55-4e5f6a7b8c05',
    key: 'repair-samples/6dbe50d4-9b72-40ce-df55-4e5f6a7b8c05.csv',
    filename: '材料费用明细.csv',
    ext: 'csv',
    mimeType: 'text/csv',
    size: 188,
    base64:
      'dGlja2V0X25vLHN0YXR1cyxtYXRlcmlhbCxxdWFudGl0eSx1bml0X3ByaWNlLGNvc3QKUlAtMjAyNi0wMDAxLGNvbXBsZXRlZCxQUFIgcGlwZSwyLDE4LjUsMzcKUlAtMjAyNi0wMDAyLHBlbmRpbmdfYWNjZXB0YW5jZSxTZWFsIHJpbmcsNCwzLjIsMTIuOApSUC0yMDI2LTAwMDMsaW5fcHJvZ3Jlc3MsTEVEIHR1YmUsNiwxMiw3Mgo=',
  },
  {
    id: '7ecf61e5-ac83-41df-ea66-5f6a7b8c9d06',
    key: 'repair-samples/7ecf61e5-ac83-41df-ea66-5f6a7b8c9d06.zip',
    filename: '历史归档包.zip',
    ext: 'zip',
    mimeType: 'application/zip',
    size: 22,
    base64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
  },
];
