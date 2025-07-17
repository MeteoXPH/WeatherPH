// Replace with your Weatherbit API key
// Get a free API key at https://www.weatherbit.io/account/create
const API_KEY = 'e37bb667c03c4f2baa0536ad73a511d2';

// --- Typhoon Track Visualization with Manual Input (Static Cone) ---
if (document.getElementById('map')) {
  // Center and zoom the map over the Philippines by default
  // Set map maxZoom to 10 for RainViewer compatibility
  const map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 10 }).setView([13, 122], 4);

  // Define base layers
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 12,
    minZoom: 4
  });

  // Add default base layer
  darkLayer.addTo(map);

  // Add layer control
  const baseLayers = {
    "Dark": darkLayer
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

  // L.control.layers(baseLayers, null, { position: 'topright', collapsed: false }).addTo(map);

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
      updateConeLayer();
      updateCustomLineLayer();
    };
  }
  if (redWindSlider) {
    redWindSlider.value = windRadiiValues.red;
    redWindSlider.oninput = function(e) {
      windRadiiValues.red = parseInt(e.target.value);
      saveWindRadiiValues();
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
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
      updateConeLayer();
      updateCustomLineLayer();
    };
  }
  if (toggleRedWindBtn) {
    toggleRedWindBtn.onclick = function() {
      windRadiiVisibility.red = !windRadiiVisibility.red;
      saveWindRadiiVisibility();
      updateWindRadiiButtons();
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
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

  // Create a LayerGroup for all typhoon features, but do NOT add to map by default
  const typhoonLayerGroup = L.layerGroup();

  function drawTrack() {
    // Remove previous cone, track, points, wind circles, callout lines, label markers
    typhoonLayerGroup.clearLayers();
    pointCircles = [];
    windCircles = [];
    calloutLines = [];
    labelMarkers = [];
    // Only draw wind radii if there is at least one point
    if (forecastPoints.length > 0) {
      let windCenter = [forecastPoints[0].lat, forecastPoints[0].lon];
  windRadii.forEach(wr => {
        const windCircle = L.circle(windCenter, {
          radius: wr.radius, color: wr.color, fillColor: wr.fillColor, fillOpacity: wr.fillOpacity, weight: 1
        }).addTo(typhoonLayerGroup);
        windCircles.push(windCircle);
      });
    }
    // Draw main track (connect all points in order)
  const trackLatLngs = forecastPoints.map(pt => [pt.lat, pt.lon]);
    if (trackLatLngs.length > 0) {
      trackLine = L.polyline(trackLatLngs, { color: '#fff', weight: 1, opacity: 0.9 }).addTo(typhoonLayerGroup);
    }
    forecastPoints.forEach((pt, idx) => {
      // Use custom hurricane icon for the point
      const hurricaneIcon = L.icon({
        iconUrl: 'hurricane.png',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        className: 'hurricane-point-icon'
      });
      const marker = L.marker([pt.lat, pt.lon], { icon: hurricaneIcon, interactive: true }).addTo(typhoonLayerGroup);
      pointCircles.push(marker);
      // Place the label marker with custom icon
      let labelLatLng;
      if (pt.labelLat !== undefined && pt.labelLng !== undefined) {
        labelLatLng = [pt.labelLat, pt.labelLng];
      } else {
        let offsetX = 60;
        let offsetY = 30;
        if (forecastPoints.length === 1) {
          // Only one point, use default offset
          offsetX = 60;
          offsetY = 30;
        } else {
        let refIdx = idx < forecastPoints.length - 1 ? idx + 1 : idx - 1;
        let refPt = forecastPoints[refIdx];
        if (refPt.lon < pt.lon) offsetX = -60;
          offsetY = (idx % 2 === 0) ? 30 : -30;
        }
        const pointPx = map.latLngToLayerPoint([pt.lat, pt.lon]);
        const labelPx = pointPx.add([offsetX, offsetY]);
        labelLatLng = map.layerPointToLatLng(labelPx);
      }
      const labelIcon = L.divIcon({
        className: 'typhoon-label',
        html: `<div>${pt.label} ${pt.time}</div>`,
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(labelLatLng, {
        icon: labelIcon,
        draggable: true,
        interactive: true
      }).addTo(typhoonLayerGroup);
      labelMarkers.push(labelMarker);
      // Draw the callout line from the point to the label marker
      function drawCallout() {
        if (calloutLines[idx]) typhoonLayerGroup.removeLayer(calloutLines[idx]);
        calloutLines[idx] = L.polyline([[pt.lat, pt.lon], labelMarker.getLatLng()], {
    color: '#fff',
          weight: 1.5,
          opacity: 0.8,
          dashArray: '2 4',
          interactive: false
        }).addTo(typhoonLayerGroup);
      }
      drawCallout();
      labelMarker.on('drag', function(e) {
        const newLatLng = e.target.getLatLng();
        pt.labelLat = newLatLng.lat;
        pt.labelLng = newLatLng.lng;
        saveForecastPoints();
        drawCallout();
      });
    });
    updatePointSelect();
    saveForecastPoints();
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

  // Add hide/show arrow button for Leaflet layer control (only once, only for the topmost control)
  setTimeout(function() {
    var layerControl = document.querySelector('.leaflet-control-layers');
    if (layerControl && !document.getElementById('leafletLayerToggleBtn')) {
      var toggleBtn = document.createElement('button');
      toggleBtn.id = 'leafletLayerToggleBtn';
      toggleBtn.innerHTML = '⯈'; // right arrow
      toggleBtn.title = 'Hide layer control';
      toggleBtn.style.position = 'absolute';
      toggleBtn.style.top = '8px';
      toggleBtn.style.right = '-28px';
      toggleBtn.style.zIndex = 10003;
      toggleBtn.style.width = '24px';
      toggleBtn.style.height = '24px';
      toggleBtn.style.borderRadius = '12px';
      toggleBtn.style.border = '1px solid #bbb';
      toggleBtn.style.background = '#fff';
      toggleBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
      toggleBtn.style.cursor = 'pointer';
      toggleBtn.style.fontSize = '16px';
      toggleBtn.style.padding = '0';
      toggleBtn.style.display = 'flex';
      toggleBtn.style.alignItems = 'center';
      toggleBtn.style.justifyContent = 'center';
      layerControl.parentElement.style.position = 'relative';
      layerControl.parentElement.appendChild(toggleBtn);
      let shown = true;
      toggleBtn.onclick = function() {
        shown = !shown;
        if (shown) {
          layerControl.style.display = '';
          toggleBtn.innerHTML = '⯈';
          toggleBtn.title = 'Hide layer control';
        } else {
          layerControl.style.display = 'none';
          toggleBtn.innerHTML = '⯇';
          toggleBtn.title = 'Show layer control';
        }
      };
    }
  }, 500);

  // Add country boundaries with a very thin, light gray outline (non-interactive, added before provinces)
  fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
    .then(res => res.json())
    .then(data => {
      L.geoJSON(data, {
        style: {
          color: '#bbb', // Light gray outline
          weight: 0.2,   // Very thin
          fill: false,
          opacity: 0.7
        },
        interactive: false
      }).addTo(map);
    });

  // --- Removed Philippine provinces (ADM2) boundary layer fetch due to missing file and CORS issues ---
  // fetch('https://raw.githubusercontent.com/tonywr71/gadm-geodata/main/geojson/PHL/PHL_adm2.geojson')
  //   .then(res => {
  //     if (!res.ok) throw new Error('PHL_adm2.geojson not found');
  //     return res.json();
  //   })
  //   .then(data => {
  //     L.geoJSON(data, {
  //       style: function(feature) {
  //         return {
  //           color: '#eee',
  //           weight: 0.7,
  //           fill: false,
  //           opacity: 0.9
  //         };
  //       },
  //       interactive: false,
  //       pane: 'overlayPane'
  //     }).addTo(map);
  //   })
  //   .catch(err => {
  //     console.warn('ADM2 boundary file missing or invalid:', err);
  //   });

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
      updateConeLayer();
      updateCustomLineLayer();
      setTimeout(updateCustomLineLayer, 10);
      form.reset();
    });
  }

  // Handle clear and delete controls
  const clearBtn = document.getElementById('clearPointsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      forecastPoints = [];
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
    });
  }
  // Add Undo Delete button
  const undoDeleteBtn = document.createElement('button');
  undoDeleteBtn.textContent = 'Undo Delete';
  undoDeleteBtn.type = 'button';
  undoDeleteBtn.style.display = 'none';
  const deleteControls = document.getElementById('delete-controls');
  if (deleteControls) {
    deleteControls.appendChild(undoDeleteBtn);
  }
  let lastDeletedPoint = null;
  let lastDeletedIndex = null;

  // Update deleteSelectedBtn event
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  if (pointSelect && deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', function() {
      const idx = parseInt(pointSelect.value);
      if (!isNaN(idx)) {
        lastDeletedPoint = forecastPoints[idx];
        lastDeletedIndex = idx;
        forecastPoints.splice(idx, 1);
        drawTrack();
        updateConeLayer();
        updateCustomLineLayer();
        undoDeleteBtn.style.display = '';
      }
    });
  }

  // Undo Delete logic
  undoDeleteBtn.onclick = function() {
    if (lastDeletedPoint !== null && lastDeletedIndex !== null) {
      forecastPoints.splice(lastDeletedIndex, 0, lastDeletedPoint);
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
      lastDeletedPoint = null;
      lastDeletedIndex = null;
      undoDeleteBtn.style.display = 'none';
    }
  };

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
    if (coneLayer) { typhoonLayerGroup.removeLayer(coneLayer); coneLayer = null; }
    if (conePoints.length > 1) {
      coneLayer = L.polygon(conePoints, {
    color: '#fff',
        weight: 0.7,
        opacity: 0.7,
        dashArray: '6 6',
      fillColor: '#fff',
        fillOpacity: 0.12,
        interactive: false
      }).addTo(typhoonLayerGroup);
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
    if (customLineLayer) { typhoonLayerGroup.removeLayer(customLineLayer); customLineLayer = null; }
    if (customLinePoints.length > 1) {
      customLineLayer = L.polyline(customLinePoints, {
        color: '#888',
        weight: 1.5,
        opacity: 0.9,
        dashArray: '8 8',
        interactive: false
      }).addTo(typhoonLayerGroup);
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

  // --- Radar Controls (Play/Pause, Slider, Time Label) ---
  const radarControls = document.getElementById('radar-controls');
  const radarPlayPauseBtn = document.getElementById('radarPlayPauseBtn');
  const radarFrameSlider = document.getElementById('radarFrameSlider');
  const radarFrameTime = document.getElementById('radarFrameTime');
  let radarPaused = false;

  function updateRadarControls() {
    if (rainviewerFrames.length > 0 && rainviewerLayer) {
      radarControls.style.display = '';
      radarFrameSlider.max = rainviewerFrames.length - 1;
      radarFrameSlider.value = rainviewerFrameIdx;
      radarPlayPauseBtn.textContent = radarPaused ? '▶' : '❚❚';
      radarFrameTime.textContent = getRainviewerFrameTime(rainviewerFrames[radarFrameIdx]);
    } else {
      radarControls.style.display = 'none';
    }
  }

  function getRainviewerFrameTime(ts) {
    // ts is a UNIX timestamp in seconds
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (radarPlayPauseBtn) {
    radarPlayPauseBtn.onclick = function() {
      radarPaused = !radarPaused;
      updateRadarControls();
      if (!radarPaused) {
        showRainviewerAnim();
      } else if (rainviewerAnimTimer) {
        clearTimeout(rainviewerAnimTimer);
      }
    };
  }

  if (radarFrameSlider) {
    radarFrameSlider.oninput = function() {
      radarFrameIdx = parseInt(radarFrameSlider.value);
      showRainviewerAnim(true); // true = don't auto-advance
      updateRadarControls();
    };
  }

  // --- RainViewer Animated Radar Layer Integration ---
  let rainviewerFrames = [];
  let rainviewerFrameIdx = 0;
  let rainviewerLayer = null;
  let rainviewerAnimTimer = null;

  // Fetch RainViewer radar frames (last 6 frames, ~1 hour)
  function fetchRainviewerFrames(callback) {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(res => res.json())
      .then(data => {
        rainviewerFrames = [...(data.radar.past || []), ...(data.radar.nowcast || [])].filter(Boolean).slice(-6);
        rainviewerFrameIdx = rainviewerFrames.length - 1;
        console.log('RainViewer frames:', rainviewerFrames); // Debug
        if (!rainviewerFrames.length) {
          alert('No RainViewer radar frames available.');
        }
        if (callback) callback();
      })
      .catch(err => {
        alert('Error fetching RainViewer frames: ' + err);
        // Fallback: try to show a static radar tile for testing
        showStaticRainviewerTile();
      });
  }

  function showRainviewerAnim(noAdvance) {
    if (!rainviewerFrames.length) {
      showStaticRainviewerTile();
      return;
    }
    const ts = rainviewerFrames[rainviewerFrameIdx];
    const url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.png`;
    if (rainviewerLayer) {
      map.removeLayer(rainviewerLayer);
      rainviewerLayer = null;
    }
    rainviewerLayer = L.tileLayer(url, {
      attribution: 'Radar: RainViewer',
      maxZoom: 10,
      minZoom: 2,
      opacity: 0.7,
      zIndex: 2000
    });
    rainviewerLayer.addTo(map);
    if (!radarPaused && !noAdvance) {
      rainviewerAnimTimer = setTimeout(() => {
        rainviewerFrameIdx = (rainviewerFrameIdx + 1) % rainviewerFrames.length;
        showRainviewerAnim();
      }, 500);
    }
  }

  function hideRainviewerAnim() {
    if (rainviewerLayer) map.removeLayer(rainviewerLayer);
    rainviewerLayer = null;
    if (rainviewerAnimTimer) clearTimeout(rainviewerAnimTimer);
  }

  // Fallback: Show a static RainViewer tile for troubleshooting
  function showStaticRainviewerTile() {
    if (rainviewerLayer) map.removeLayer(rainviewerLayer);
    rainviewerLayer = L.tileLayer('https://tilecache.rainviewer.com/v2/radar/1688700000/256/{z}/{x}/{y}/2/1_1.png', {
      attribution: 'Radar: RainViewer',
      maxZoom: 10,
      minZoom: 2,
      opacity: 0.7,
      zIndex: 2000
    });
    rainviewerLayer.addTo(map);
    alert('Showing static RainViewer tile for troubleshooting.');
  }

  // --- OpenWeatherMap Animated Radar Layer Integration ---
  // Insert your OpenWeatherMap API key here:
  const OWM_API_KEY = '7b7c9906ae1a8fb884b074a06bd1d78f'; // <-- User's actual API key
  let owmRadarLayers = [];
  let owmRadarAnimTimer = null;
  let owmRadarFrameIdx = 0;
  let owmRadarTimestamps = [];

  // Helper: get last 12 timestamps (2 hours, 10 min step)
  function getLast12Timestamps() {
    const now = Math.floor(Date.now() / 1000);
    const step = 600; // 10 min
    let arr = [];
    for (let i = 11; i >= 0; i--) {
      arr.push(now - i * step);
    }
    return arr;
  }

  function showOWMRadarAnim() {
    if (!owmRadarTimestamps.length) return;
    const ts = owmRadarTimestamps[owmRadarFrameIdx];
    const url = `https://maps.openweathermap.org/maps/2.0/radar/{z}/{x}/{y}?appid=${OWM_API_KEY}&tm=${ts}`;
    // Remove previous radar layer
    owmRadarLayers.forEach(layer => map.removeLayer(layer));
    owmRadarLayers = [];
    // Add new radar layer
    const radarLayer = L.tileLayer(url, {
      attribution: 'Radar: OpenWeatherMap',
      maxZoom: 10,
      minZoom: 2,
      opacity: 0.7,
      zIndex: 2000
    });
    radarLayer.addTo(map);
    owmRadarLayers.push(radarLayer);
    owmRadarAnimTimer = setTimeout(() => {
      owmRadarFrameIdx = (owmRadarFrameIdx + 1) % owmRadarTimestamps.length;
      showOWMRadarAnim();
    }, 500);
  }

  function hideOWMRadarAnim() {
    owmRadarLayers.forEach(layer => map.removeLayer(layer));
    owmRadarLayers = [];
    if (owmRadarAnimTimer) clearTimeout(owmRadarAnimTimer);
  }

  // Dummy layer for 'Radar' so it appears in the layer control
  const dummyOWMRadarLayer = L.layerGroup();

  // Add layer control for Typhoon Track and 'Radar' (as a dummy overlay)
  L.control.layers(baseLayers, {
    'Typhoon Track': typhoonLayerGroup,
    'Radar': dummyOWMRadarLayer
  }, { position: 'topright', collapsed: false }).addTo(map);

  // Always show Typhoon Track by default
  typhoonLayerGroup.addTo(map);

  // Listen for overlayadd/overlayremove events to toggle the animated radar overlay
  map.on('overlayadd', function(e) {
    if (e.name === 'Radar') {
      owmRadarTimestamps = getLast12Timestamps();
      owmRadarFrameIdx = 0;
      showOWMRadarAnim();
    }
  });
  map.on('overlayremove', function(e) {
    if (e.name === 'Radar') hideOWMRadarAnim();
  });

  // --- Leaflet Layer Control Toggle Button Logic ---
  setTimeout(function() {
    const leafletLayerControl = document.querySelector('.leaflet-control-layers');
    if (leafletLayerControl && !document.getElementById('leafletLayerToggleBtn')) {
      const btn = document.createElement('button');
      btn.id = 'leafletLayerToggleBtn';
      btn.type = 'button';
      btn.innerHTML = '⯈';
      btn.style.position = 'absolute';
      btn.style.top = '10px';
      btn.style.right = '10px';
      btn.style.zIndex = '10003';
      btn.style.width = '28px';
      btn.style.height = '28px';
      btn.style.borderRadius = '14px';
      btn.style.border = '1px solid #bbb';
      btn.style.background = '#fff';
      btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
      btn.style.fontSize = '18px';
      btn.style.lineHeight = '28px';
      btn.style.padding = '0';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.cursor = 'pointer';
      const mapDiv = document.getElementById('map');
      if (mapDiv) mapDiv.appendChild(btn);
      let leafletPanelHidden = false;
      const mapSizeToggleBtn = document.getElementById('mapSizeToggleBtn');
      const mapFullScreenBtn = document.getElementById('mapFullScreenBtn');
      btn.onclick = function() {
        leafletPanelHidden = !leafletPanelHidden;
        if (leafletPanelHidden) {
          leafletLayerControl.classList.add('leaflet-control-hidden');
          btn.classList.add('collapsed');
          btn.innerHTML = '⯇';
        } else {
          leafletLayerControl.classList.remove('leaflet-control-hidden');
          btn.classList.remove('collapsed');
          btn.innerHTML = '⯈';
        }
      };
    }
  }, 0);

  // --- Map Size Toggle Functionality ---
  const mapSizeToggleBtn = document.getElementById('mapSizeToggleBtn');
  const mapElement = document.getElementById('map');
  let isMapFullScreen = false;
  // Ensure map starts in small screen mode
  mapElement.classList.remove('fullscreen');
  mapElement.classList.add('smaller');
  if (mapSizeToggleBtn) mapSizeToggleBtn.textContent = '⛶';

  if (mapSizeToggleBtn) {
    mapSizeToggleBtn.onclick = function() {
      isMapFullScreen = !isMapFullScreen;
      if (isMapFullScreen) {
        mapElement.classList.add('fullscreen');
        mapElement.classList.remove('smaller');
        mapSizeToggleBtn.textContent = '🗗';
      } else {
        mapElement.classList.remove('fullscreen');
        mapElement.classList.add('smaller');
        mapSizeToggleBtn.textContent = '⛶';
      }
      setTimeout(() => map.invalidateSize(), 350);
    };
  }

  // Apply saved map size on load
  // Remove all updateMapSize() calls (already removed in previous edits)

  // --- Satellite Image Toggle (Latest Still Satellite Overlay) ---
  const satelliteImageBtn = document.getElementById('satelliteImageBtn');
  let satelliteVisible = false;

  if (satelliteImageBtn) {
    satelliteImageBtn.onclick = function() {
      if (!satelliteVisible) {
        if (!satelliteLayer) {
          satelliteLayer = L.tileLayer('https://maps.open-meteo.com/satellite/latest/{z}/{x}/{y}.jpg', {
            attribution: 'Satellite: Open-Meteo',
            maxZoom: 12,
            opacity: 0.85
          });
        }
        satelliteLayer.addTo(map);
        satelliteImageBtn.textContent = 'Hide Satellite Image';
        satelliteVisible = true;
      } else {
        if (satelliteLayer) map.removeLayer(satelliteLayer);
        satelliteImageBtn.textContent = 'Show Satellite Image';
        satelliteVisible = false;
      }
    };
  }

  // --- Himawari-8 Satellite Cloud Image Toggle (inside map, always on top) ---
  const himawariBtn = document.getElementById('himawariBtn');
  let himawariVisible = false;

  if (himawariBtn) {
    himawariBtn.onclick = function() {
      if (!himawariVisible) {
        if (!rainviewerLayer) { // Use rainviewerLayer for Himawari-8
          showRainviewerAnim();
        }
        himawariBtn.textContent = 'Hide Himawari-8 Satellite';
        himawariVisible = true;
      } else {
        hideRainviewerAnim();
        himawariBtn.textContent = 'Show Himawari-8 Satellite';
        himawariVisible = false;
      }
    };
  }

  const controlsToggleBtn = document.getElementById('controlsToggleBtn');
  const controlsRowPanel = document.getElementById('controls-row');
  let controlsHidden = false;
  if (controlsToggleBtn && controlsRowPanel) {
    controlsToggleBtn.onclick = function() {
      controlsHidden = !controlsHidden;
      if (controlsHidden) {
        controlsRowPanel.classList.add('hidden');
        controlsToggleBtn.classList.add('collapsed');
        controlsToggleBtn.innerHTML = '⯇';
      } else {
        controlsRowPanel.classList.remove('hidden');
        controlsToggleBtn.classList.remove('collapsed');
        controlsToggleBtn.innerHTML = '⯈';
      }
    };
  }
} 