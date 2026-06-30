export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/**
 * Lists PDF and KPDF files from Google Drive, optionally filtered by a search term.
 */
export async function listDriveFiles(accessToken: string, searchName?: string): Promise<DriveFile[]> {
  let q = "(mimeType = 'application/pdf' or name contains '.kpdf' or name contains '.json')";
  if (searchName) {
    const escapedName = searchName.replace(/'/g, "\\'");
    q += ` and name contains '${escapedName}'`;
  }
  q += " and trashed = false";

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=modifiedTime desc`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Downloads a file from Google Drive as a Blob.
 */
export async function downloadDriveFile(accessToken: string, fileId: string): Promise<Blob> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download file from Google Drive: ${response.status} - ${errorText}`);
  }

  return response.blob();
}

/**
 * Uploads a file (PDF or KPDF) to Google Drive.
 */
export async function uploadDriveFile(
  accessToken: string,
  filename: string,
  mimeType: string,
  blob: Blob,
  folderId?: string
): Promise<any> {
  const metadata: any = {
    name: filename,
    mimeType: mimeType
  };
  
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = 'boundary_pdf_editor';
  const delimiter = `--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const headerPart = delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n`;

  const footerPart = close_delim;

  const multipartBlob = new Blob([
    headerPart,
    blob,
    footerPart
  ], { type: `multipart/related; boundary=${boundary}` });

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: multipartBlob
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file to Google Drive: ${response.status} - ${errorText}`);
  }

  return response.json();
}
