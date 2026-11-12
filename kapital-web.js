// Помощники браузера для Капитала: шифрование резервной копии и работа с файлами.
// Kotlin вызывает их как внешние функции (см. BackupCrypto.web.kt и Platform.web.kt).
// Данные никуда не отправляются: всё происходит на этом устройстве.
(() => {
  'use strict';

  // Тот же формат, что на Android (BackupCrypto): AES-256-GCM, ключ из пароля через PBKDF2-SHA256;
  // «итерации.соль.вектор.шифротекст», всё в Base64. Копия с телефона открывается здесь и наоборот.
  const ITERATIONS = 200000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const WRONG_PASSWORD = 'kapital-wrong-password';

  const toBase64 = (bytes) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const fromBase64 = (text) => {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  async function key(password, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  globalThis.kapitalEncrypt = async (plain, password) => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      await key(password, salt, ITERATIONS),
      new TextEncoder().encode(plain),
    );
    return [String(ITERATIONS), toBase64(salt), toBase64(iv), toBase64(new Uint8Array(data))].join('.');
  };

  // Неверный пароль и повреждённый файл неразличимы: в обоих случаях ошибка WRONG_PASSWORD.
  globalThis.kapitalDecrypt = async (payload, password) => {
    try {
      const parts = payload.split('.');
      const iterations = parseInt(parts[0], 10);
      if (parts.length !== 4 || !(iterations > 0)) throw new Error('format');
      const data = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(parts[2]), tagLength: 128 },
        await key(password, fromBase64(parts[1]), iterations),
        fromBase64(parts[3]),
      );
      return new TextDecoder().decode(data);
    } catch (e) {
      throw new Error(WRONG_PASSWORD);
    }
  };

  // Сохраняет текст в файл: браузер скачивает его в папку загрузок или спрашивает, куда сохранить.
  globalThis.kapitalSaveFile = (name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Открывает окно выбора файла и возвращает его текст; null — если человек передумал.
  globalThis.kapitalOpenFile = () => new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) resolve(null); else file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
})();
