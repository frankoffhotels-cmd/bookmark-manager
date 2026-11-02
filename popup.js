const TAGS_STORAGE_KEY = "bookmarkTags";

const elements = {
  bookmarkCount: document.querySelector("#bookmarkCount"),
  bookmarkGrid: document.querySelector("#bookmarkGrid"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  dialogBookmarkTitle: document.querySelector("#dialogBookmarkTitle"),
  emptyState: document.querySelector("#emptyState"),
  resultCount: document.querySelector("#resultCount"),
  searchInput: document.querySelector("#searchInput"),
  statusMessage: document.querySelector("#statusMessage"),
  tagDialog: document.querySelector("#tagDialog"),
  tagFilters: document.querySelector("#tagFilters"),
  tagForm: document.querySelector("#tagForm"),
  tagInput: document.querySelector("#tagInput"),
  cancelDialogButton: document.querySelector("#cancelDialogButton")
};

let bookmarks = [];
let tagsByBookmark = {};
let activeTag = null;
let editingBookmark = null;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueTags = new Map();
  for (const tag of value) {
    if (typeof tag !== "string") {
      continue;
    }

    const trimmedTag = tag.trim();
    if (trimmedTag) {
      const key = trimmedTag.toLocaleLowerCase();
      if (!uniqueTags.has(key)) {
        uniqueTags.set(key, trimmedTag);
      }
    }
  }

  return [...uniqueTags.values()];
}

function parseTagsInput(value) {
  return normalizeTags(value.split(","));
}

function flattenBookmarks(nodes) {
  const flattened = [];

  for (const node of nodes) {
    if (node.url) {
      flattened.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url
      });
    }

    if (node.children) {
      flattened.push(...flattenBookmarks(node.children));
    }
  }

  return flattened;
}

function getSafeBookmarkUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (["http:", "https:", "ftp:", "file:", "chrome:"].includes(parsedUrl.protocol)) {
      return parsedUrl.href;
    }
  } catch {
    return null;
  }

  return null;
}

function getDisplayUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname || parsedUrl.protocol.replace(":", "");
  } catch {
    return url;
  }
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function getAllTags() {
  const uniqueTags = new Map();
  for (const tags of Object.values(tagsByBookmark)) {
    for (const tag of tags) {
      const key = tag.toLocaleLowerCase();
      if (!uniqueTags.has(key)) {
        uniqueTags.set(key, tag);
      }
    }
  }
  return [...uniqueTags.values()].sort((first, second) => first.localeCompare(second));
}

function renderFilters() {
  elements.tagFilters.replaceChildren();

  const filters = [{ label: "Все", value: null }, ...getAllTags().map((tag) => ({
    label: tag,
    value: tag
  }))];

  if (activeTag && !filters.some((filter) => filter.value === activeTag)) {
    activeTag = null;
  }

  for (const filter of filters) {
    const button = createElement("button", "filter-chip", filter.label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(filter.value === activeTag));
    button.addEventListener("click", () => {
      activeTag = filter.value;
      renderFilters();
      renderBookmarks();
    });
    elements.tagFilters.append(button);
  }
}

function createBookmarkCard(bookmark) {
  const card = createElement("article", "bookmark-card");
  const top = createElement("div", "bookmark-card-top");
  const mark = createElement("span", "site-mark", [...bookmark.title][0]?.toLocaleUpperCase() || "З");
  mark.setAttribute("aria-hidden", "true");

  const safeUrl = getSafeBookmarkUrl(bookmark.url);
  const title = safeUrl
    ? createElement("a", "bookmark-title", bookmark.title)
    : createElement("span", "bookmark-title", bookmark.title);
  if (safeUrl) {
    title.href = safeUrl;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.title = `Открыть: ${bookmark.title}`;
  }

  top.append(mark, title);
  const url = createElement("p", "bookmark-url", getDisplayUrl(bookmark.url));
  url.title = bookmark.url;

  const footer = createElement("div", "bookmark-card-footer");
  const tags = tagsByBookmark[bookmark.id] || [];
  if (tags.length) {
    for (const tag of tags) {
      footer.append(createElement("span", "bookmark-tag", tag));
    }
  } else {
    footer.append(createElement("span", "no-tags", "Без тегов"));
  }

  const editButton = createElement("button", "edit-tags-button", "✎");
  editButton.type = "button";
  editButton.setAttribute("aria-label", `Изменить теги: ${bookmark.title}`);
  editButton.title = "Изменить теги";
  editButton.addEventListener("click", () => openTagDialog(bookmark));

  card.append(top, url, footer, editButton);
  return card;
}

function renderBookmarks() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase();
  const visibleBookmarks = bookmarks.filter((bookmark) => {
    const tags = tagsByBookmark[bookmark.id] || [];
    const matchesSearch = !query
      || bookmark.title.toLocaleLowerCase().includes(query)
      || tags.some((tag) => tag.toLocaleLowerCase().includes(query));
    const matchesTag = !activeTag || tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  const addBookmarkButton = createElement("button", "bookmark-card add-bookmark-card");
  addBookmarkButton.type = "button";
  addBookmarkButton.setAttribute("aria-label", "Добавить закладку в Chrome");
  addBookmarkButton.append(
    createElement("span", "add-bookmark-icon", "+"),
    createElement("span", "add-bookmark-label", "Добавить")
  );
  addBookmarkButton.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://bookmarks/" });
  });

  elements.bookmarkGrid.replaceChildren(
    ...visibleBookmarks.map(createBookmarkCard),
    addBookmarkButton
  );
  elements.bookmarkCount.textContent = String(bookmarks.length);
  elements.resultCount.textContent = `${visibleBookmarks.length} из ${bookmarks.length}`;
  elements.emptyState.hidden = visibleBookmarks.length > 0;

  if (bookmarks.length === 0) {
    elements.emptyState.textContent = "В Chrome пока нет закладок. Добавьте закладку, и она появится здесь.";
  } else if (visibleBookmarks.length === 0) {
    elements.emptyState.textContent = "Ничего не найдено. Измените поисковый запрос или выберите другой тег.";
  }
}

function render() {
  renderFilters();
  renderBookmarks();
}

function openTagDialog(bookmark) {
  editingBookmark = bookmark;
  elements.dialogBookmarkTitle.textContent = bookmark.title;
  elements.tagInput.value = (tagsByBookmark[bookmark.id] || []).join(", ");
  elements.statusMessage.textContent = "";
  elements.tagDialog.showModal();
  elements.tagInput.focus();
}

function closeTagDialog() {
  elements.tagDialog.close();
  editingBookmark = null;
}

async function saveTags(event) {
  event.preventDefault();
  if (!editingBookmark) {
    return;
  }

  const nextTags = parseTagsInput(elements.tagInput.value);
  const stored = await chrome.storage.local.get(TAGS_STORAGE_KEY);
  const updatedTags = isRecord(stored[TAGS_STORAGE_KEY]) ? { ...stored[TAGS_STORAGE_KEY] } : {};

  if (nextTags.length) {
    updatedTags[editingBookmark.id] = nextTags;
  } else {
    delete updatedTags[editingBookmark.id];
  }

  await chrome.storage.local.set({ [TAGS_STORAGE_KEY]: updatedTags });
  tagsByBookmark = updatedTags;
  closeTagDialog();
  render();
}

async function loadBookmarks() {
  const [tree, stored] = await Promise.all([
    chrome.bookmarks.getTree(),
    chrome.storage.local.get(TAGS_STORAGE_KEY)
  ]);

  bookmarks = flattenBookmarks(tree);
  const storedTags = stored[TAGS_STORAGE_KEY];
  tagsByBookmark = {};

  if (isRecord(storedTags)) {
    for (const [bookmarkId, tags] of Object.entries(storedTags)) {
      const normalizedTags = normalizeTags(tags);
      if (normalizedTags.length) {
        tagsByBookmark[bookmarkId] = normalizedTags;
      }
    }
  }

  elements.statusMessage.textContent = "";
  render();
}

elements.searchInput.addEventListener("input", renderBookmarks);
elements.tagForm.addEventListener("submit", (event) => {
  saveTags(event).catch((error) => {
    elements.statusMessage.textContent = `Не удалось сохранить теги: ${error.message}`;
  });
});
elements.closeDialogButton.addEventListener("click", closeTagDialog);
elements.cancelDialogButton.addEventListener("click", closeTagDialog);
elements.tagDialog.addEventListener("click", (event) => {
  if (event.target === elements.tagDialog) {
    closeTagDialog();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[TAGS_STORAGE_KEY]) {
    return;
  }

  const nextTags = changes[TAGS_STORAGE_KEY].newValue;
  tagsByBookmark = {};
  if (isRecord(nextTags)) {
    for (const [bookmarkId, tags] of Object.entries(nextTags)) {
      const normalizedTags = normalizeTags(tags);
      if (normalizedTags.length) {
        tagsByBookmark[bookmarkId] = normalizedTags;
      }
    }
  }
  render();
});

chrome.bookmarks.onCreated.addListener(() => {
  loadBookmarks().catch((error) => {
    elements.statusMessage.textContent = `Не удалось обновить закладки: ${error.message}`;
  });
});
chrome.bookmarks.onRemoved.addListener(() => {
  loadBookmarks().catch((error) => {
    elements.statusMessage.textContent = `Не удалось обновить закладки: ${error.message}`;
  });
});
chrome.bookmarks.onChanged.addListener(() => {
  loadBookmarks().catch((error) => {
    elements.statusMessage.textContent = `Не удалось обновить закладки: ${error.message}`;
  });
});
chrome.bookmarks.onMoved.addListener(() => {
  loadBookmarks().catch((error) => {
    elements.statusMessage.textContent = `Не удалось обновить закладки: ${error.message}`;
  });
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditingText = target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditingText) {
    event.preventDefault();
    elements.searchInput.focus();
  }
});

loadBookmarks().catch((error) => {
  elements.statusMessage.textContent = `Не удалось загрузить закладки: ${error.message}`;
  elements.emptyState.textContent = "Проверьте разрешения расширения и попробуйте снова.";
  elements.emptyState.hidden = false;
});
