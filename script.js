// Replace with your Weatherbit API key
// Get a free API key at https://www.weatherbit.io/account/create
const API_KEY = 'e37bb667c03c4f2baa0536ad73a511d2';

// --- Typhoon Track Visualization with Manual Input (Static Cone) ---
if (document.getElementById('map')) {
  const map = L.map('map', { zoomControl: false }).setView([26, 124], 6);

  // Define base layers
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 12,
    minZoom: 4
  });
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 17,
    minZoom: 4
  });

  // Add default base layer
  darkLayer.addTo(map);

  // Add layer control
  const baseLayers = {
    "Dark": darkLayer,
    "Satellite": satelliteLayer
  };

  // Remove Open-Meteo satellite overlay
  // Add OpenWeatherMap wind overlay
  // const OWM_API_KEY = '515ad5cdb3c1ad52ce5d99a181c5af8e';
  // const windLayer = L.tileLayer('https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=' + OWM_API_KEY, {
  //   attribution: 'Wind data &copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>',
  //   maxZoom: 12,
  //   opacity: 0.7,
  //   transparent: true
  // });

  // const overlays = {
  //   "Wind (OpenWeatherMap)": windLayer
  // };

  // L.control.layers(baseLayers, overlays, { position: 'topright', collapsed: false }).addTo(map);

  // (Removed RainViewer animation control, so nothing is added here)

  // Store forecast points (let so we can update)
  let forecastPoints = [];

  // Load saved points from localStorage if available
  if (localStorage.getItem('forecastPoints')) {
    try {
      forecastPoints = JSON.parse(localStorage.getItem('forecastPoints')) || [];
    } catch (e) {
      forecastPoints = [];
    }
  }

  function saveForecastPoints() {
    localStorage.setItem('forecastPoints', JSON.stringify(forecastPoints));
  }

  // Static cone polygon
  const conePolygon = [
    [25.5, 120.5],
    [31.5, 124.5],
    [31.5, 127.5],
    [25.5, 123.5]
  ];

  // --- Adjustable Wind Radii Sliders ---
  const orangeWindSlider = document.getElementById('orangeWindSlider');
  const redWindSlider = document.getElementById('redWindSlider');

  // Load saved wind radii from localStorage
  let windRadiiValues = {
    orange: 165000,
    red: 77000
  };
  if (localStorage.getItem('windRadiiValues')) {
    try {
      windRadiiValues = JSON.parse(localStorage.getItem('windRadiiValues')) || windRadiiValues;
    } catch (e) {}
  }

  function saveWindRadiiValues() {
    localStorage.setItem('windRadiiValues', JSON.stringify(windRadiiValues));
  }

  if (orangeWindSlider) {
    orangeWindSlider.value = windRadiiValues.orange;
    orangeWindSlider.oninput = function(e) {
      windRadiiValues.orange = parseInt(e.target.value);
      saveWindRadiiValues();
      drawTrack();
    };
  }
  if (redWindSlider) {
    redWindSlider.value = windRadiiValues.red;
    redWindSlider.oninput = function(e) {
      windRadiiValues.red = parseInt(e.target.value);
      saveWindRadiiValues();
      drawTrack();
    };
  }

  // Update windRadii array to use adjustable values
  let windRadii = [
    { radius: windRadiiValues.orange, color: '#a67c52', fillColor: '#a67c52', fillOpacity: 0.35 },
    { radius: windRadiiValues.red, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.5 }
  ];

  // Keep references to layers so we can remove them before redraw
  let cone = null;
  let trackLine = null;
  let pointCircles = [];
  let windCircles = [];
  let calloutLines = [];
  let labelMarkers = [];

  // --- Wind Radii Hide/Show Buttons ---
  const toggleOrangeWindBtn = document.getElementById('toggleOrangeWindBtn');
  const toggleRedWindBtn = document.getElementById('toggleRedWindBtn');

  // Load visibility from localStorage
  let windRadiiVisibility = { orange: true, red: true };
  if (localStorage.getItem('windRadiiVisibility')) {
    try {
      windRadiiVisibility = JSON.parse(localStorage.getItem('windRadiiVisibility')) || windRadiiVisibility;
    } catch (e) {}
  }
  function saveWindRadiiVisibility() {
    localStorage.setItem('windRadiiVisibility', JSON.stringify(windRadiiVisibility));
  }

  function updateWindRadiiButtons() {
    if (toggleOrangeWindBtn) toggleOrangeWindBtn.textContent = windRadiiVisibility.orange ? 'Hide Orange' : 'Show Orange';
    if (toggleRedWindBtn) toggleRedWindBtn.textContent = windRadiiVisibility.red ? 'Hide Red' : 'Show Red';
  }
  updateWindRadiiButtons();

  if (toggleOrangeWindBtn) {
    toggleOrangeWindBtn.onclick = function() {
      windRadiiVisibility.orange = !windRadiiVisibility.orange;
      saveWindRadiiVisibility();
      updateWindRadiiButtons();
      drawTrack();
    };
  }
  if (toggleRedWindBtn) {
    toggleRedWindBtn.onclick = function() {
      windRadiiVisibility.red = !windRadiiVisibility.red;
      saveWindRadiiVisibility();
      updateWindRadiiButtons();
      drawTrack();
    };
  }

  // Patch drawTrack to respect visibility
  const originalDrawTrack2 = drawTrack;
  drawTrack = function() {
    windRadii = [];
    if (windRadiiVisibility.orange) {
      windRadii.push({ radius: windRadiiValues.orange, color: '#a67c52', fillColor: '#a67c52', fillOpacity: 0.35 });
    }
    if (windRadiiVisibility.red) {
      windRadii.push({ radius: windRadiiValues.red, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.5 });
    }
    originalDrawTrack2();
  };

  function drawTrack() {
    // Remove previous cone, track, points, wind circles, callout lines, label markers
    if (cone) { map.removeLayer(cone); cone = null; }
    if (trackLine) { map.removeLayer(trackLine); trackLine = null; }
    pointCircles.forEach(c => map.removeLayer(c));
    pointCircles = [];
    windCircles.forEach(c => map.removeLayer(c));
    windCircles = [];
    calloutLines.forEach(l => map.removeLayer(l));
    calloutLines = [];
    labelMarkers.forEach(m => map.removeLayer(m));
    labelMarkers = [];

    // Only draw wind radii if there is at least one point
    if (forecastPoints.length > 0) {
      let windCenter = [forecastPoints[0].lat, forecastPoints[0].lon];
  windRadii.forEach(wr => {
        const windCircle = L.circle(windCenter, {
          radius: wr.radius, color: wr.color, fillColor: wr.fillColor, fillOpacity: wr.fillOpacity, weight: 1
    }).addTo(map);
        windCircles.push(windCircle);
  });
    }

    // Draw main track (connect all points in order)
  const trackLatLngs = forecastPoints.map(pt => [pt.lat, pt.lon]);
    if (trackLatLngs.length > 0) {
      trackLine = L.polyline(trackLatLngs, { color: '#fff', weight: 1, opacity: 0.9 }).addTo(map);
    }
    forecastPoints.forEach((pt, idx) => {
      // Use custom hurricane icon for the point
      const hurricaneIcon = L.icon({
        iconUrl: 'hurricane.png',
        iconSize: [12, 12], // Even smaller size
        iconAnchor: [6, 6],
        className: 'hurricane-point-icon'
      });
      const marker = L.marker([pt.lat, pt.lon], { icon: hurricaneIcon, interactive: true }).addTo(map);
      pointCircles.push(marker);

      // Place the label marker with custom icon
      let offsetX = 60;
      if (forecastPoints.length > 1) {
        let refIdx = idx < forecastPoints.length - 1 ? idx + 1 : idx - 1;
        let refPt = forecastPoints[refIdx];
        if (refPt.lon < pt.lon) offsetX = -60;
      }
      let offsetY = (idx % 2 === 0) ? 30 : -30;
      const pointPx = map.latLngToLayerPoint([pt.lat, pt.lon]);
      const labelPx = pointPx.add([offsetX, offsetY]);
      const labelLatLng = map.layerPointToLatLng(labelPx);
      const labelIcon = L.divIcon({
        className: 'typhoon-label',
        html: `<div>${pt.label} ${pt.time}</div>`,
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(labelLatLng, {
        icon: labelIcon,
        draggable: true,
        interactive: true
      }).addTo(map);
      labelMarkers.push(labelMarker);

      // Draw the callout line from the point to the label marker
      function drawCallout() {
        if (calloutLines[idx]) map.removeLayer(calloutLines[idx]);
        calloutLines[idx] = L.polyline([[pt.lat, pt.lon], labelMarker.getLatLng()], {
    color: '#fff',
          weight: 1.5,
          opacity: 0.8,
          dashArray: '2 4',
          interactive: false
  }).addTo(map);
      }
      drawCallout();
      labelMarker.on('drag', drawCallout);
    });
    updatePointSelect();
    saveForecastPoints(); // Save after every draw (add, delete, clear)
  }

  // Update the select box for deleting points
  const pointSelect = document.getElementById('pointSelect');
  function updatePointSelect() {
    if (!pointSelect) return;
    pointSelect.innerHTML = '';
  forecastPoints.forEach((pt, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.text = `${pt.label} (${pt.lat}, ${pt.lon})`;
      pointSelect.appendChild(opt);
    });
  }

  // --- Draw Philippine Area of Responsibility (PAR) ---
  function drawPAR() {
    // Coordinates: 5°N 115°E, 15°N 115°E, 21°N 120°E, 25°N 120°E, 25°N 135°E, 5°N 135°E, and back to 5°N 115°E
    const parCoords = [
      [5, 115],
      [15, 115],
      [21, 120],
      [25, 120],
      [25, 135],
      [5, 135],
      [5, 115] // Close the polygon
    ];
    L.polyline(parCoords, {
      color: '#fff',
      weight: 1, // Thinner line
      opacity: 0.9,
      dashArray: '8 8', // Broken/dashed line
      fill: false,
      interactive: false
    }).addTo(map);
  }

  // Remove drawTracedConeOfUncertainty and its call

  // Initial draw
  drawTrack();
  drawPAR();

  // Handle form input for adding points
  const form = document.getElementById('typhoonPointForm');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const lat = parseFloat(document.getElementById('latInput').value);
      const lon = parseFloat(document.getElementById('lonInput').value);
      const weekday = document.getElementById('weekdayInput').value;
      const timeOfDay = document.getElementById('timeOfDayInput').value;
      const month = document.getElementById('monthInput').value;
      const day = document.getElementById('dayInput').value;
      const label = document.getElementById('labelInput').value;
      const time = `${weekday} - ${timeOfDay} | ${month} ${day}`;
      forecastPoints.push({ lat, lon, label, time });
      drawTrack();
      form.reset();
    });
  }

  // Handle clear and delete controls
  const clearBtn = document.getElementById('clearPointsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      forecastPoints = [];
      drawTrack();
    });
  }
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  if (pointSelect && deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', function() {
      const idx = parseInt(pointSelect.value);
      if (!isNaN(idx)) {
        forecastPoints.splice(idx, 1);
        drawTrack();
      }
    });
  }

  // Populate dayInput dropdown (1-31)
  const dayInput = document.getElementById('dayInput');
  if (dayInput) {
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.text = i;
      dayInput.appendChild(opt);
    }
  }

  // --- Pixel-Perfect Image Overlay Feature ---
  const overlayContainer = document.getElementById('imageOverlayContainer');
  let overlayImg = null;
  const insertImageBtn = document.getElementById('insertImageBtn');
  const imageFileInput = document.getElementById('imageFileInput');
  const imageOpacityInput = document.getElementById('imageOpacity');
  const removeImageBtn = document.getElementById('removeImageBtn');

  if (insertImageBtn && imageFileInput && imageOpacityInput && removeImageBtn && overlayContainer) {
    insertImageBtn.onclick = function() {
      imageFileInput.click();
    };
    imageFileInput.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) { console.log('No file selected'); return; }
      const reader = new FileReader();
      reader.onload = function(evt) {
        overlayContainer.innerHTML = '';
        overlayImg = document.createElement('img');
        overlayImg.src = evt.target.result;
        overlayImg.style.position = 'absolute';
        overlayImg.style.opacity = imageOpacityInput.value;
        overlayImg.onload = function() {
          // Center the image in the map container at original size
          const mapDiv = document.getElementById('map');
          const mapRect = mapDiv.getBoundingClientRect();
          overlayImg.style.left = ((mapDiv.offsetWidth - overlayImg.naturalWidth) / 2) + 'px';
          overlayImg.style.top = ((mapDiv.offsetHeight - overlayImg.naturalHeight) / 2) + 'px';
          overlayImg.style.width = overlayImg.naturalWidth + 'px';
          overlayImg.style.height = overlayImg.naturalHeight + 'px';
        };
        overlayContainer.appendChild(overlayImg);
        imageOpacityInput.style.display = '';
        removeImageBtn.style.display = '';
      };
      reader.readAsDataURL(file);
    };
    imageOpacityInput.oninput = function(e) {
      if (overlayImg) {
        overlayImg.style.opacity = e.target.value;
      }
    };
    removeImageBtn.onclick = function() {
      overlayContainer.innerHTML = '';
      overlayImg = null;
      imageOpacityInput.style.display = 'none';
      removeImageBtn.style.display = 'none';
      imageFileInput.value = '';
    };
  }

  // --- Manual Cone Tracing Feature with Save/Delete ---
  let tracingCone = false;
  let conePoints = [];
  let coneLayer = null;
  const startTracingBtn = document.createElement('button');
  startTracingBtn.textContent = 'Start Tracing Cone';
  startTracingBtn.type = 'button';
  startTracingBtn.style.margin = '6px';
  const finishTracingBtn = document.createElement('button');
  finishTracingBtn.textContent = 'Finish Cone';
  finishTracingBtn.type = 'button';
  finishTracingBtn.style.margin = '6px';
  finishTracingBtn.style.display = 'none';
  const removeConeBtn = document.getElementById('removeConeBtn');
  const controlsRow = document.getElementById('controls-row');
  if (controlsRow) {
    controlsRow.appendChild(startTracingBtn);
    controlsRow.appendChild(finishTracingBtn);
  }

  // Load saved cone from localStorage
  if (localStorage.getItem('conePoints')) {
    try {
      conePoints = JSON.parse(localStorage.getItem('conePoints')) || [];
    } catch (e) {
      conePoints = [];
    }
  }

  function saveConePoints() {
    localStorage.setItem('conePoints', JSON.stringify(conePoints));
  }

  function updateConeLayer() {
    if (coneLayer) { map.removeLayer(coneLayer); coneLayer = null; }
    if (conePoints.length > 1) {
      coneLayer = L.polygon(conePoints, {
        color: '#fff',
        weight: 0.7,
        opacity: 0.7,
        dashArray: '6 6',
      fillColor: '#fff',
        fillOpacity: 0.12,
        interactive: false
      }).addTo(map);
      if (removeConeBtn) removeConeBtn.style.display = '';
    } else {
      if (removeConeBtn) removeConeBtn.style.display = 'none';
    }
    saveConePoints();
  }

  startTracingBtn.onclick = function() {
    tracingCone = true;
    conePoints = [];
    updateConeLayer();
    startTracingBtn.style.display = 'none';
    finishTracingBtn.style.display = '';
    map.getContainer().style.cursor = 'crosshair';
  };

  finishTracingBtn.onclick = function() {
    tracingCone = false;
    updateConeLayer();
    startTracingBtn.style.display = '';
    finishTracingBtn.style.display = 'none';
    map.getContainer().style.cursor = '';
  };

  if (removeConeBtn) {
    removeConeBtn.onclick = function() {
      conePoints = [];
      updateConeLayer();
    };
  }

  map.on('click', function(e) {
    if (tracingCone) {
      conePoints.push([e.latlng.lat, e.latlng.lng]);
      updateConeLayer();
    }
  });

  // Draw cone on load if points exist
  updateConeLayer();

  // --- Custom Line Drawing Tool ---
  let drawingCustomLine = false;
  let customLinePoints = [];
  let customLineLayer = null;
  const drawCustomLineBtn = document.createElement('button');
  drawCustomLineBtn.textContent = 'Draw Custom Line';
  drawCustomLineBtn.type = 'button';
  drawCustomLineBtn.style.margin = '6px';
  const finishCustomLineBtn = document.createElement('button');
  finishCustomLineBtn.textContent = 'Finish Line';
  finishCustomLineBtn.type = 'button';
  finishCustomLineBtn.style.margin = '6px';
  finishCustomLineBtn.style.display = 'none';
  const removeCustomLineBtn = document.createElement('button');
  removeCustomLineBtn.textContent = 'Remove Custom Line';
  removeCustomLineBtn.type = 'button';
  removeCustomLineBtn.style.margin = '6px';
  removeCustomLineBtn.style.display = 'none';
  if (controlsRow) {
    controlsRow.appendChild(drawCustomLineBtn);
    controlsRow.appendChild(finishCustomLineBtn);
    controlsRow.appendChild(removeCustomLineBtn);
  }

  // Load saved custom line from localStorage
  if (localStorage.getItem('customLinePoints')) {
    try {
      customLinePoints = JSON.parse(localStorage.getItem('customLinePoints')) || [];
    } catch (e) {
      customLinePoints = [];
    }
  }

  function saveCustomLinePoints() {
    localStorage.setItem('customLinePoints', JSON.stringify(customLinePoints));
  }

  function updateCustomLineLayer() {
    if (customLineLayer) { map.removeLayer(customLineLayer); customLineLayer = null; }
    if (customLinePoints.length > 1) {
      customLineLayer = L.polyline(customLinePoints, {
        color: '#888',
        weight: 1.5,
        opacity: 0.9,
        dashArray: '8 8',
        interactive: false
      }).addTo(map);
      removeCustomLineBtn.style.display = '';
    } else {
      removeCustomLineBtn.style.display = 'none';
    }
    saveCustomLinePoints();
  }

  drawCustomLineBtn.onclick = function() {
    drawingCustomLine = true;
    customLinePoints = [];
    updateCustomLineLayer();
    drawCustomLineBtn.style.display = 'none';
    finishCustomLineBtn.style.display = '';
    map.getContainer().style.cursor = 'crosshair';
  };

  finishCustomLineBtn.onclick = function() {
    drawingCustomLine = false;
    updateCustomLineLayer();
    drawCustomLineBtn.style.display = '';
    finishCustomLineBtn.style.display = 'none';
    map.getContainer().style.cursor = '';
  };

  removeCustomLineBtn.onclick = function() {
    customLinePoints = [];
    updateCustomLineLayer();
  };

  map.on('click', function(e) {
    if (drawingCustomLine) {
      customLinePoints.push([e.latlng.lat, e.latlng.lng]);
      updateCustomLineLayer();
    }
  });

  // Draw custom line on load if points exist
  updateCustomLineLayer();

  // --- OpenWeatherMap Animated Satellite Layer ---
  // This section is removed as per the edit hint to remove OWM animation and overlays.
  // The Open-Meteo static satellite layer is now the only satellite layer available.
} 