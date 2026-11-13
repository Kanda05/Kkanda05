(() => {
  'use strict';

  const departments = [
    {
      id: 'cas',
      name: 'College of Arts and Sciences',
      logo: 'assets/cas.png',
      description: 'Explore the humanities, social sciences, and natural sciences through programs that build broad knowledge, critical thinking, communication, and research skills.'
    },
    {
      id: 'cba',
      name: 'College of Business and Accountancy',
      logo: 'assets/cba.png',
      description: 'Prepare for careers in business, management, and accountancy through study of financial principles, organizational practice, and responsible decision-making.'
    },
    {
      id: 'ccs',
      name: 'College of Computer Studies',
      logo: 'assets/ccs.png',
      description: 'Develop computing knowledge and practical skills for designing, building, and supporting digital systems, software, and information technology solutions.'
    },
    {
      id: 'ced',
      name: 'College of Education',
      logo: 'assets/ced.png',
      description: 'Build the subject knowledge, teaching practice, and professional skills needed to support learning and contribute to the education of future generations.'
    },
    {
      id: 'cme',
      name: 'College of Maritime Education',
      logo: 'assets/cme.png',
      description: 'Study maritime subjects and develop the technical knowledge, discipline, and professional competencies needed for careers in the maritime sector.'
    },
    {
      id: 'coe',
      name: 'College of Engineering',
      logo: 'assets/coe.png',
      description: 'Apply mathematics, science, and design to engineering challenges while developing the analytical and practical skills needed to create useful solutions.'
    },
    {
      id: 'ccje',
      name: 'College of Criminal Justice Education',
      logo: 'assets/crim.png',
      description: 'Study criminal justice, public safety, and related professional practices, with an emphasis on knowledge, ethics, and service to the community.'
    },
    {
      id: 'cohs',
      name: 'College of Health Sciences',
      logo: 'assets/cohs.png',
      description: 'Build foundational health-science knowledge and practical competencies for professional roles that promote health and support the well-being of individuals and communities.'
    }
  ];

  const screens = {
    welcome: document.getElementById('welcome-screen'),
    scanner: document.getElementById('scanner-screen'),
    directory: document.getElementById('directory-screen'),
    detail: document.getElementById('detail-screen')
  };
  const video = document.getElementById('camera-video');
  const scanStatus = document.getElementById('scan-status');
  const toast = document.getElementById('toast');
  let cameraStream = null;
  let scanTimer = null;
  let scanBusy = false;
  let targetImage = null;
  let targetDescriptors = null;
  let targetKeypoints = null;
  let orb = null;
  let matcher = null;
  let targetReady = false;
  let toastTimer = null;

  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => {
      element.classList.toggle('is-hidden', key !== name);
    });
  }

  function makeDepartmentCard(department) {
    const button = document.createElement('button');
    button.className = 'department-card';
    button.type = 'button';
    button.dataset.departmentId = department.id;
    button.setAttribute('aria-label', `View ${department.name} details`);
    button.setAttribute('aria-pressed', 'false');

    const logoObject = document.createElement('span');
    logoObject.className = 'logo-object';
    logoObject.setAttribute('aria-hidden', 'true');

    const image = document.createElement('img');
    image.src = department.logo;
    image.alt = '';
    image.loading = 'eager';

    const name = document.createElement('strong');
    name.textContent = department.name;

    const action = document.createElement('span');
    action.className = 'card-action';
    action.textContent = 'View details';

    logoObject.append(image);
    button.append(logoObject, name, action);
    button.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const bounds = button.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      button.style.setProperty('--tilt-x', `${(0.5 - y) * 10}deg`);
      button.style.setProperty('--tilt-y', `${(x - 0.5) * 10}deg`);
    });
    button.addEventListener('pointerleave', () => {
      button.style.setProperty('--tilt-x', '0deg');
      button.style.setProperty('--tilt-y', '0deg');
    });
    button.addEventListener('click', () => {
      document.querySelectorAll('.department-card').forEach((card) => {
        card.setAttribute('aria-pressed', String(card.dataset.departmentId === department.id));
      });
      openDepartment(department);
    });
    return button;
  }

  function renderDirectory() {
    const grid = document.getElementById('department-grid');
    grid.replaceChildren(...departments.map(makeDepartmentCard));
    const arGrid = document.getElementById('ar-department-grid');
    arGrid.replaceChildren(...departments.map(makeDepartmentCard));
  }

  function openDepartment(department) {
    closeCamera();
    document.getElementById('detail-logo').src = department.logo;
    document.getElementById('detail-logo').alt = `${department.name} logo`;
    document.getElementById('detail-name').textContent = department.name;
    document.getElementById('detail-description').textContent = department.description;
    showScreen('detail');
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('is-hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add('is-hidden'), 6000);
  }

  function closeCamera() {
    window.clearInterval(scanTimer);
    scanTimer = null;
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    video.srcObject = null;
  }

  function openDirectory() {
    closeCamera();
    document.getElementById('ar-directory-overlay').classList.add('is-hidden');
    document.getElementById('scanner-screen').classList.remove('is-recognized');
    showScreen('directory');
  }

  function showArDirectory() {
    window.clearInterval(scanTimer);
    scanTimer = null;
    document.getElementById('scanner-screen').classList.add('is-recognized');
    document.getElementById('ar-directory-overlay').classList.remove('is-hidden');
    scanStatus.textContent = 'Select a department logo to view its profile.';
  }

  function reportCameraError(error) {
    closeCamera();
    showScreen('welcome');
    const messages = {
      NotAllowedError: 'Camera permission was denied. Allow camera access in your browser settings, or browse the directory without scanning.',
      NotFoundError: 'No camera was found on this device. You can still browse all eight departments.',
      NotReadableError: 'The camera is already in use or unavailable. Close other camera apps and try again.'
    };
    showToast(messages[error.name] || error.message || 'Unable to start the camera. Use HTTPS or localhost and check your browser camera permissions.');
  }

  function openCvReady() {
    return new Promise((resolve, reject) => {
      if (window.cv && window.cv.Mat) {
        resolve(window.cv);
        return;
      }
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.cv && window.cv.Mat) {
          window.clearInterval(timer);
          resolve(window.cv);
        } else if (Date.now() - started > 20000) {
          window.clearInterval(timer);
          reject(new Error('OpenCV.js did not load. Check your internet connection and reload the page.'));
        }
      }, 100);
    });
  }

  function prepareTarget(cv) {
    if (targetReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          const source = cv.imread(canvas);
          const gray = new cv.Mat();
          const mask = new cv.Mat();
          cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
          targetKeypoints = new cv.KeyPointVector();
          targetDescriptors = new cv.Mat();
          orb = new cv.ORB(1200);
          orb.detectAndCompute(gray, mask, targetKeypoints, targetDescriptors);
          source.delete();
          gray.delete();
          mask.delete();
          if (targetDescriptors.empty() || targetKeypoints.size() < 12) {
            reject(new Error('The CU logo image has too few visual features to scan. Use a clear, high-resolution logo image.'));
            return;
          }
          targetImage = { width: image.naturalWidth, height: image.naturalHeight };
          matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
          targetReady = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error('Could not load assets/culogo.png.'));
      image.src = 'assets/culogo.png';
    });
  }

  function detectTarget(cv) {
    if (scanBusy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !targetDescriptors) return;
    scanBusy = true;
    let frame;
    let gray;
    let mask;
    let keypoints;
    let descriptors;
    let matches;
    let inlierMask;
    let sourcePoints;
    let destinationPoints;
    let homography;

    try {
      const canvas = document.getElementById('camera-canvas');
      const ratio = Math.min(1, 720 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * ratio);
      canvas.height = Math.round(video.videoHeight * ratio);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frame = cv.imread(canvas);
      gray = new cv.Mat();
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
      mask = new cv.Mat();
      keypoints = new cv.KeyPointVector();
      descriptors = new cv.Mat();
      orb.detectAndCompute(gray, mask, keypoints, descriptors);

      if (!descriptors.empty()) {
        matches = new cv.DMatchVector();
        matcher.match(targetDescriptors, descriptors, matches);
        const goodMatches = [];
        for (let i = 0; i < matches.size(); i += 1) {
          const match = matches.get(i);
          if (match.distance < 54) goodMatches.push(match);
        }
        goodMatches.sort((a, b) => a.distance - b.distance);
        if (goodMatches.length >= 10) {
          const selected = goodMatches.slice(0, Math.min(goodMatches.length, 100));
          const from = [];
          selected.forEach((match) => {
            const targetPoint = targetKeypoints.get(match.queryIdx).pt;
            const framePoint = keypoints.get(match.trainIdx).pt;
            from.push(targetPoint.x, targetPoint.y, framePoint.x, framePoint.y);
          });
          sourcePoints = cv.matFromArray(selected.length, 1, cv.CV_32FC2, from.filter((_, index) => index % 4 < 2));
          destinationPoints = cv.matFromArray(selected.length, 1, cv.CV_32FC2, from.filter((_, index) => index % 4 >= 2));
          inlierMask = new cv.Mat();
          homography = cv.findHomography(sourcePoints, destinationPoints, cv.RANSAC, 5, inlierMask);
          const inliers = cv.countNonZero(inlierMask);
          if (!homography.empty() && inliers >= 8) {
            const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
              0, 0,
              targetImage.width, 0,
              targetImage.width, targetImage.height,
              0, targetImage.height
            ]);
            const projected = new cv.Mat();
            cv.perspectiveTransform(corners, projected, homography);
            const points = projected.data32F;
            const xs = [points[0], points[2], points[4], points[6]];
            const ys = [points[1], points[3], points[5], points[7]];
            const width = Math.max(...xs) - Math.min(...xs);
            const height = Math.max(...ys) - Math.min(...ys);
            if (width > 45 && height > 45 && width < canvas.width * 1.4 && height < canvas.height * 1.4) {
              scanStatus.textContent = 'Logo recognized.';
              projected.delete();
              corners.delete();
              showArDirectory();
              return;
            }
            projected.delete();
            corners.delete();
          }
        }
      }
      scanStatus.textContent = 'Move closer and keep the logo steady in the frame.';
    } catch (error) {
      scanStatus.textContent = 'Having trouble reading the image. Keep the logo flat and well lit.';
      console.error('Logo recognition failed:', error);
    } finally {
      [
        frame, gray, mask, keypoints, descriptors, matches, inlierMask,
        sourcePoints, destinationPoints, homography
      ].forEach((mat) => {
        if (mat && typeof mat.delete === 'function') mat.delete();
      });
      scanBusy = false;
    }
  }

  async function startScan() {
    document.getElementById('ar-directory-overlay').classList.add('is-hidden');
    document.getElementById('scanner-screen').classList.remove('is-recognized');
    showScreen('scanner');
    scanStatus.textContent = 'Loading image recognition…';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access needs HTTPS or localhost in a supported browser.');
      }
      const cv = await openCvReady();
      await prepareTarget(cv);
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      video.srcObject = cameraStream;
      await video.play();
      scanStatus.textContent = 'Show the CU logo inside the frame.';
      scanTimer = window.setInterval(() => detectTarget(cv), 500);
    } catch (error) {
      reportCameraError(error);
    }
  }

  document.getElementById('start-scan').addEventListener('click', startScan);
  document.getElementById('browse-directory').addEventListener('click', openDirectory);
  document.getElementById('manual-directory').addEventListener('click', openDirectory);
  document.getElementById('dismiss-ar-directory').addEventListener('click', () => {
    document.getElementById('ar-directory-overlay').classList.add('is-hidden');
    document.getElementById('scanner-screen').classList.remove('is-recognized');
    scanStatus.textContent = 'Show the CU logo inside the frame.';
    openCvReady().then((cv) => {
      if (!scanTimer && cameraStream) scanTimer = window.setInterval(() => detectTarget(cv), 500);
    }).catch((error) => showToast(error.message));
  });
  document.getElementById('scan-again').addEventListener('click', startScan);
  document.getElementById('close-scanner').addEventListener('click', () => {
    closeCamera();
    showScreen('welcome');
  });
  document.getElementById('back-to-directory').addEventListener('click', () => showScreen('directory'));
  document.getElementById('home-link').addEventListener('click', (event) => {
    event.preventDefault();
    closeCamera();
    showScreen('welcome');
  });

  renderDirectory();
  showScreen('directory');
})();
