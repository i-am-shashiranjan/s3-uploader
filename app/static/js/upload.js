const dropZone     = document.getElementById('dropZone');
const fileInput    = document.getElementById('fileInput');
const browseBtn    = document.getElementById('browseBtn');
const filePreview       = document.getElementById('filePreview');
const fileListContainer = document.getElementById('fileListContainer');
const uploadBtn         = document.getElementById('uploadBtn');
const progressArea = document.getElementById('progressArea');
const progressBar  = document.getElementById('progressBar');
const progressGlow = document.getElementById('progressGlow');
const progressPct  = document.getElementById('progressPct');
const progressSub  = document.getElementById('progressSub');
const successCard  = document.getElementById('successCard');
const successMsg   = document.getElementById('successMsg');
const successMeta  = document.getElementById('successMeta');
const uploadMoreBtn= document.getElementById('uploadMoreBtn');
const totalEl      = document.getElementById('totalUploaded');

let selectedFiles = [];
let uploadCount  = 0;
let curPct       = 0;

/* ── File selection ── */
browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) pickFiles(fileInput.files); });

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) pickFiles(e.dataTransfer.files);
});

function pickFiles(files) {
  for (let i = 0; i < files.length; i++) {
    selectedFiles.push(files[i]);
  }
  renderFileList();
  filePreview.style.display = 'block';
  progressArea.style.display = 'none';
  resetProgress();
}

function renderFileList() {
  fileListContainer.innerHTML = '';
  if (selectedFiles.length === 0) {
    filePreview.style.display = 'none';
    return;
  }
  selectedFiles.forEach((file, index) => {
    fileListContainer.innerHTML += `
      <div class="file-info" style="margin-bottom: 12px;">
        <div class="file-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:20px;height:20px;">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
          </svg>
        </div>
        <div class="file-meta">
          <span class="file-name">${file.name}</span>
          <span class="file-size">${fmtBytes(file.size)}</span>
        </div>
        <button class="remove-file" onclick="removeFileIndex(${index})" aria-label="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
  });
}

window.removeFileIndex = function(index) {
  selectedFiles.splice(index, 1);
  if (selectedFiles.length === 0) fileInput.value = '';
  renderFileList();
};

/* ── Upload ── */
uploadBtn.addEventListener('click', startUpload);

async function startUpload() {
  if (selectedFiles.length === 0) return;
  uploadBtn.disabled = true;
  progressArea.style.display = 'block';

  await animPct(0, 15, 400, 'Preparing files…');
  await animPct(15, 35, 300, 'Connecting to AWS S3 (ap-south-1)…');

  const fd = new FormData();
  selectedFiles.forEach(file => fd.append('file', file));

  try {
    await xhrUpload(fd);
  } catch (err) {
    showError(err.message || 'Upload failed.');
  }
}

function xhrUpload(fd) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const mapped = 35 + Math.round((e.loaded / e.total) * 50);
        setPct(mapped, 'Uploading to s3://kli-datascience/user_upload_files/…');
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          await animPct(curPct, 95, 250, 'Finalizing…');
          await animPct(95, 100, 150, 'Complete!');
          uploadCount += selectedFiles.length;
          totalEl.textContent = uploadCount;
          setTimeout(() => showSuccess(data), 350);
          resolve(data);
        } else {
          reject(new Error(data.message));
        }
      } else {
        reject(new Error(`Server error ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.open('POST', '/api/upload');
    xhr.send(fd);
  });
}

/* ── Progress helpers ── */
function setPct(pct, label) {
  curPct = pct;
  progressBar.style.width  = pct + '%';
  progressGlow.style.width = pct + '%';
  progressPct.textContent  = pct + '%';
  if (label) progressSub.textContent = label;
}

function animPct(from, to, ms, label) {
  return new Promise(resolve => {
    const t0 = performance.now();
    (function step(now) {
      const t = Math.min((now - t0) / ms, 1);
      const e = t < .5 ? 2*t*t : -1+(4-2*t)*t;
      setPct(Math.round(from + (to-from)*e), label);
      t < 1 ? requestAnimationFrame(step) : resolve();
    })(t0);
  });
}

function resetProgress() {
  curPct = 0; setPct(0, '');
  uploadBtn.disabled = false;
  progressSub.style.color = '';
}

/* ── Success ── */
function showSuccess(data) {
  filePreview.style.display = 'none';
  dropZone.style.display    = 'none';
  successCard.style.display = 'block';
  successMsg.textContent    = data.message;
  
  let fileNamesHtml = data.filenames.map(name => `<div>• ${name}</div>`).join('');
  
  successMeta.innerHTML = `
    <div><strong>Uploaded Files:</strong></div>
    ${fileNamesHtml}
    <br>
    <div><strong>S3 Bucket :</strong> ${data.bucket}</div>
    <div><strong>S3 Folder :</strong> ${data.folder}</div>
    <div><strong>Region    :</strong> ap-south-1</div>
  `;
}

function showError(msg) {
  progressSub.style.color = '#f87171';
  progressSub.textContent = '✕ ' + msg;
  setTimeout(() => { resetProgress(); }, 3500);
}

/* ── Upload more ── */
uploadMoreBtn.addEventListener('click', () => {
  selectedFiles = []; fileInput.value = '';
  if (fileListContainer) fileListContainer.innerHTML = '';
  successCard.style.display = 'none';
  dropZone.style.display    = 'block';
  filePreview.style.display = 'none';
  resetProgress();
});

/* ── Utility ── */
function fmtBytes(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1048576)    return (b/1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
  return (b/1073741824).toFixed(2) + ' GB';
}