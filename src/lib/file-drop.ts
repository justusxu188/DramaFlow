type DroppedEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (
    success: (file: File) => void,
    failure?: (error: DOMException) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: DroppedEntry[]) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
};

type DroppedItem = {
  webkitGetAsEntry?: () => DroppedEntry | null;
};

type DroppedData = {
  items: ArrayLike<DroppedItem>;
  files: ArrayLike<File>;
};

function readFile(entry: DroppedEntry) {
  return new Promise<File>((resolve, reject) => {
    if (!entry.file) {
      reject(new Error("无法读取拖入的文件"));
      return;
    }
    entry.file(resolve, reject);
  });
}

function readDirectoryBatch(
  reader: NonNullable<
    ReturnType<NonNullable<DroppedEntry["createReader"]>>
  >,
) {
  return new Promise<DroppedEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function filesFromEntry(
  entry: DroppedEntry,
): Promise<File[]> {
  if (entry.isFile) {
    return [await readFile(entry)];
  }
  if (!entry.isDirectory || !entry.createReader) {
    return [];
  }

  const reader = entry.createReader();
  const files: File[] = [];
  while (true) {
    const entries = await readDirectoryBatch(reader);
    if (!entries.length) break;
    for (const child of entries) {
      files.push(...(await filesFromEntry(child)));
    }
  }
  return files;
}

export async function filesFromDataTransfer(
  dataTransfer: DroppedData,
) {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter(
      (entry): entry is DroppedEntry => Boolean(entry),
    );

  if (!entries.length) {
    return Array.from(dataTransfer.files);
  }

  const files: File[] = [];
  for (const entry of entries) {
    files.push(...(await filesFromEntry(entry)));
  }
  return files;
}
