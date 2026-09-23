// Настройки сайта. Пустое значение — соответствующая кнопка или блок не показывается.
window.BADR_CONFIG = {
  contacts: {
    // Телефон в любом формате, например "+7 928 123-45-67"
    phone: "+7 988 307-15-15",
    // Номер WhatsApp в любом формате (можно тот же, что и телефон)
    whatsapp: "+7 988 307-15-15",
    // Личный Telegram для заявок: юзернейм без @, например "badrbook_manager"
    telegram: "Badr_Book",
    // Telegram-канал: юзернейм без @, например "badrbook"
    telegramChannel: "",
    // Instagram: юзернейм без @, например "badr.book"
    instagram: "",
  },

  // Ссылка на лист «Прайс», опубликованный как CSV (Файл → Поделиться → Опубликовать в интернете).
  // Пока пусто — сайт показывает прайс из файла data/prices.csv.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vReSmyxd1DVMcWFWYZ8-Zdz1TPwe81Eewdl2MnbYCfY6sjfCrCZV0CazmqhOhGgQha-5GeBoV3nmtE-/pub?gid=496609157&single=true&output=csv",

  // ID Google-таблицы (часть ссылки между /d/ и /edit) — для кнопки «Скачать Excel».
  sheetId: "",

  // Текст «Об издательстве» — вставьте между обратными кавычками ` `. Абзацы разделяются пустой строкой.
  about: ``,

  // Условия оптовой закупки — так же, между обратными кавычками.
  wholesaleTerms: ``,
};
