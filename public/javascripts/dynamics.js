const cesiumContainer = document.getElementById('cesiumContainer');
const clearButton = document.getElementById('clearButton');
const colorTextArea = document.getElementById('color-picker');
const showSunlightCheckbox = document.getElementById('showSunlight');
const showLabelsCheckbox = document.getElementById('showLabels');
const takeSnapshotButton = document.getElementById('takeSnapshot');
const populateWalkerDeltaButton = document.getElementById('populateWalkerDelta');

let satelliteStack = [];

import { buildLine1, buildLine2 } from './tle.js';
import { randomName, getOrbitalPeriodMinutes } from './propagatorUtils.js';

const picker = new easepick.create({
    element: "#datepicker",
    css: [
        "/stylesheets/index.css",
        '/stylesheets/datepicker.css',
    ],
    zIndex: 10,
    format: "YYYY-MM-DDTHH:mm:ss.sss",
    TimePlugin: {
        seconds: true
    },
    plugins: [
        "RangePlugin",
        "TimePlugin"
    ],
    setup(picker) {
        picker.on('select', (e) => {
            updateGlobalDates();
            console.log("Date changed");
        });
    }
});

let viewer, timestepInSeconds, iso8601Start, iso8601End;
let icrfEnabled = true; // Track ICRF state

document.addEventListener('DOMContentLoaded', async function () {
    await initCesiumRender();
    await setDefaultDates();
});

async function setDefaultDates() {
    const today = new Date();
    today.setMilliseconds(0);
    today.setSeconds(0);
    picker.setStartDate(today);
    picker.setEndDate(shiftDateByMinutes(today, 120));
    await updateGlobalDates();
}

async function updateGlobalDates() {
    iso8601Start = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    iso8601End = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
}

function shiftDateByMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

async function initCesiumRender() {

    // Configure Cesium Ion access token
    await fetch('/get-cesium-config')
        .then(response => response.json())
        .then(cesiumConfig => {
            if (cesiumConfig.apiKey) {
                Cesium.Ion.defaultAccessToken = cesiumConfig.apiKey;
                console.log('Cesium Ion token configured successfully');
            } else {
                console.warn('No Cesium Ion token found - using offline mode');
            }
        })
        .catch(error => {
            console.error('Error obtaining Cesium API key:', error);
            console.warn('Falling back to offline mode');
        });

    // Set ArcGIS access token if available (optional - works without token too)
    // Cesium.ArcGisMapService.defaultAccessToken = "<Your ArcGIS Access Token>";

    // Optimized for offline usage:
    viewer = new Cesium.Viewer("cesiumContainer", {
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
            Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
                Cesium.ArcGisBaseMapType.SATELLITE
            )
        ),
        orderIndependentTranslucency: false,
        baseLayerPicker: true, // Keep the picker but we'll customize it
        geocoder: false,
        homeButton: true,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        infoBox: false,
        scene3DOnly: true,
    });

    // Customize the base layer picker by removing unwanted imagery providers
    const imageryProviders = viewer.baseLayerPicker.viewModel.imageryProviderViewModels;

    // Clear all default providers
    imageryProviders.removeAll();

    // Add only the imagery providers you want

    // ESRI World Imagery (using modern ArcGIS API)
    imageryProviders.push(new Cesium.ProviderViewModel({
        name: 'ArcGIS Satellite',
        iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/ArcGisMapServiceWorldImagery.png'),
        tooltip: 'ArcGIS World Imagery (Satellite)',
        creationFunction: function () {
            return Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
                Cesium.ArcGisBaseMapType.SATELLITE
            );
        }
    }));

    // Natural Earth II (offline, good default)
    imageryProviders.push(new Cesium.ProviderViewModel({
        name: 'Natural Earth II',
        iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/naturalEarthII.png'),
        tooltip: 'Natural Earth II imagery (offline)',
        creationFunction: function () {
            return Cesium.TileMapServiceImageryProvider.fromUrl(
                Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
            );
        }
    }));

    // OpenStreetMap (free alternative)
    imageryProviders.push(new Cesium.ProviderViewModel({
        name: 'OpenStreetMap',
        iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/openStreetMap.png'),
        tooltip: 'OpenStreetMap imagery',
        creationFunction: function () {
            return new Cesium.OpenStreetMapImageryProvider({
                url: 'https://a.tile.openstreetmap.org/'
            });
        }
    }));

    // Earth at Night - using a different approach
    imageryProviders.push(new Cesium.ProviderViewModel({
        name: "Earth at Night",
        iconUrl: Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/earthAtNight.png"),
        tooltip: "Earth at night imagery showing city lights from Cesium Ion",
        creationFunction: function () {
            return Cesium.IonImageryProvider.fromAssetId(3812);
        }
    }));

    // Set the default selected imagery provider (ArcGis)
    viewer.baseLayerPicker.viewModel.selectedImagery = imageryProviders[0];

    const scene = viewer.scene;
    const controller = scene.screenSpaceCameraController;

    // Minimum zoom distance to prevent going underground
    controller.minimumZoomDistance = 50000.0; // km
    controller.maximumZoomDistance = 5.0e8;   // ~500,000 km

    // Rotation controls (slower = smoother)
    controller._maximumRotateRate = 0.2;  // default 1.77
    controller._minimumRotateRate = 0.01; // default 0.02

    // Zoom controls
    controller.zoomFactor = 1;         // default 5.0; smaller = smoother zoom steps
    controller.wheelZoomFactor = 0.0005;   // control on mouse wheel. It doesn't work.

    // Translation (panning)
    controller.translateFactor = 1.0;    // leave close to default for stability

    // Inertia (smooth continuation)
    controller.inertiaSpin = 0.95;       // default 0.9
    controller.inertiaTranslate = 0.95;  // default 0.9
    controller.inertiaZoom = 0.85;       // default 0.8

    // Globe detail level: smaller error = sharper but heavier
    scene.globe.maximumScreenSpaceError = 2; // default 2; 1 = sharper but heavier

    // Optional: better lighting feel
    scene.globe.enableLighting = true;

    const camera = new Cesium.Camera(scene);
    camera.defaultZoomAmount = 50000;

    const refreshRate = 30;
    viewer.scene.screenSpaceCameraController.zoomFactor *= 60 / refreshRate;

    // Add camera distance monitoring for ICRF control
    viewer.scene.camera.changed.addEventListener(function () {
        const camera = viewer.scene.camera;
        const cameraPos = camera.positionWC;
        const globeCenter = Cesium.Cartesian3.ZERO;
        const distance = Cesium.Cartesian3.distance(cameraPos, globeCenter);

        // Disable ICRF when zoomed in close (better for detailed navigation)
        // Enable ICRF when zoomed out (better for orbital mechanics view)
        const icrfThreshold = 500000; // ~500 km from Earth center

        if (distance < icrfThreshold && icrfEnabled) {
            // Zoomed in - disable ICRF for smooth local navigation
            icrfEnabled = false;
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            console.log("ICRF disabled - close navigation mode");
        } else if (distance >= icrfThreshold && !icrfEnabled) {
            // Zoomed out - re-enable ICRF for orbital view
            icrfEnabled = true;
            console.log("ICRF enabled - orbital view mode");
        }
    });

}

async function propagateAndRenderWalkingDelta(tle, timestepInSeconds, iso8601Start, iso8601End, plotOptions = { point: true, path: true, label: true }) {

    if (tle === "") {
        alert("TLE field is empty. Cannot propagate.");
        return;
    }

    if (timestepInSeconds === null || timestepInSeconds === undefined || isNaN(timestepInSeconds)) {
        console.log("Timestep is not defined. Using default value of 30 seconds.");
        timestepInSeconds = 30;
    } else if (timestepInSeconds < 1) {
        console.log("Timestep cannot be less than 1 second. Defaulting to 1 second.");
        timestepInSeconds = 1;
    }

    let tleArray = tle.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let start = Cesium.JulianDate.fromIso8601(iso8601Start);
    let stop = Cesium.JulianDate.fromIso8601(iso8601End);
    let totalSeconds = Cesium.JulianDate.secondsDifference(stop, start);

    totalSeconds = Math.min(totalSeconds, 604800);
    if (totalSeconds === 604800) {
        console.log("Warning: Defaulting to 1 week");
    }
    if (totalSeconds <= 0) {
        console.log("Timespan must be greater than zero: " + totalSeconds);
        return;
    }

    let satName, tle1, tle2;

    if (tleArray.length == 2) {
        tle1 = tleArray[0];
        tle2 = tleArray[1];
        satName = tle1.substring(2, 5);
    } else if (tleArray.length == 3) {
        satName = tleArray[0];
        tle1 = tleArray[1];
        tle2 = tleArray[2];
    } else {
        tleArray = randomizeSatellite().split('\n');
        tle1 = tleArray[1];
        tle2 = tleArray[2];
        satName = tleArray[0];
        // TODO use the satellite's orbital period
        totalSeconds = 120 * 60;
        console.log("TLE invalid.");
    }

    updateViewerClock(start, totalSeconds);

    let trajectory = await propagateSGP4(tle1, tle2, start, totalSeconds, timestepInSeconds);
    satelliteStack.push(satName);

    if (plotOptions.point) {
        addSatellitePoint(satName, trajectory.eciSampledPositions, getSelectedColor());
    }
    if (plotOptions.path) {
        addSatellitePath(satName, trajectory.eciPositions, getSelectedColor(), 1);
    }
    if (plotOptions.label) {
        addSatelliteLabel(satName, trajectory.eciSampledPositions, 10);
    }

    viewInICRF();
}

async function propagateSGP4(tleLine1, tleLine2, start, totalSeconds, timestepInSeconds) {

    let satrec = satellite.twoline2satrec(tleLine1.trim(), tleLine2.trim());

    let ecefSampledPositions = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.FIXED);
    let eciSampledPositions = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);
    let eciPositions = [];
    let ecefPositions = [];

    for (let i = 0; i <= totalSeconds; i += timestepInSeconds) {

        const timeStamp = Cesium.JulianDate.addSeconds(start, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(timeStamp);
        const sgp4ECIPos = await satellite.propagate(satrec, jsDate);
        if (!sgp4ECIPos || !sgp4ECIPos.position) {
            // SGP4 can fail for bad TLEs or out-of-range epochs
            // Skip this sample safely
            continue;
        }
        const gmst = satellite.gstime(jsDate);
        const geodeticPos = satellite.eciToGeodetic(sgp4ECIPos.position, gmst);
        const ecefPos = satellite.eciToEcf(sgp4ECIPos.position, gmst);

        const ex = sgp4ECIPos.position.x * 1000;
        const ey = sgp4ECIPos.position.y * 1000;
        const ez = sgp4ECIPos.position.z * 1000;
        if (!isFinite(ex) || !isFinite(ey) || !isFinite(ez)) {
            continue;
        }
        const eciPosition = Cesium.Cartesian3.fromElements(ex, ey, ez);

        const ecfx = ecefPos.x * 1000;
        const ecfy = ecefPos.y * 1000;
        const ecfz = ecefPos.z * 1000;
        if (!isFinite(ecfx) || !isFinite(ecfy) || !isFinite(ecfz)) {
            continue;
        }
        const ecefPosition = new Cesium.Cartesian3(ecfx, ecfy, ecfz);

        ecefSampledPositions.addSample(timeStamp, ecefPosition);
        eciSampledPositions.addSample(timeStamp, eciPosition);

        // JSON output objects:
        const jsonPositionECI = {
            time: timeStamp,
            pos: [eciPosition.x, eciPosition.y, eciPosition.z]
        };
        eciPositions.push(jsonPositionECI);

        const jsonPositionECEF = {
            time: timeStamp,
            position: [ecefPosition.x, ecefPosition.y, ecefPosition.z, (180 / Math.PI) * geodeticPos.latitude, (180 / Math.PI) * geodeticPos.longitude]
        };
        ecefPositions.push(jsonPositionECEF);

    }

    return { eciSampledPositions, ecefSampledPositions, eciPositions, ecefPositions };

}

function updateViewerClock(start, totalSeconds) {
    //const start = Cesium.JulianDate.fromDate(new Date());
    let stop = Cesium.JulianDate.addSeconds(start, totalSeconds, new Cesium.JulianDate());
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.timeline.zoomTo(start, stop);
    viewer.clock.multiplier = 20;
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
}

function addSatellitePoint(satName, positionsOverTime, color = Cesium.Color.RED) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            return satPos;
        }, false),
        point: {
            pixelSize: 5,
            color: (() => {
                const c = color;
                return new Cesium.Color(c.red, c.green, c.blue, 1.0); // Force solid color
            })(),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE
        },
        id: satName + "_point",
        show: true
    });
}

function addSatellitePath(satName, positionsOverTime, color, widthInPixels = 2) {

    let positionsToPlot = positionsOverTime.map(timedPosition =>
        new Cesium.Cartesian3(timedPosition.pos[0], timedPosition.pos[1], timedPosition.pos[2])
    );

    viewer.entities.add({
        polyline: {
            positions: new Cesium.CallbackProperty(function (time, result) {
                // Get the ICRF to FIXED transform for the current time
                const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
                if (!Cesium.defined(icrfToFixed)) {
                    // Fallback: just show ECI positions
                    return positionsToPlot;
                }
                // Transform each ECI position to ECEF for display
                return positionsToPlot.map(function (eciPos) {
                    return Cesium.Matrix3.multiplyByVector(icrfToFixed, eciPos, new Cesium.Cartesian3());
                });
            }, false),
            width: widthInPixels,
            material: color,
            arcType: Cesium.ArcType.GEODESIC,
            granularity: Cesium.Math.toRadians(1.0),
        },
        billboard: undefined,
        id: satName + "_path",
    });
}

function addSatelliteLabel(satName, positionsOverTime, sizeInPx = 16) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            const satPos = positionsOverTime.getValue(time);
            return satPos;
        }, false),
        label: {
            text: satName,
            font: `${sizeInPx}px sans-serif`,
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20)
        },
        id: satName + "_label"
    });
}

function addSatelliteIcon(satName, positionsOverTime) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            return satPos;
        }, false),
        //point: { pixelSize: 0, color: Cesium.Color.RED },
        outlineColor: Cesium.Color.BLACK,
        billboard: {
            image: "../images/satellite.png",
            scale: 1,
        },
        id: satName + "_icon", // TODO: Remove orientation if not needed
        orientation: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            if (!satPos) return Cesium.Quaternion.IDENTITY;

            // Nadir direction: from satellite to Earth's center
            const nadir = Cesium.Cartesian3.negate(satPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nadir, nadir);

            // Default "up" for cylinder is +Z, so rotate Z to nadir
            const up = Cesium.Cartesian3.UNIT_Z;
            const axis = Cesium.Cartesian3.cross(up, nadir, new Cesium.Cartesian3());
            const angle = Cesium.Cartesian3.angleBetween(up, nadir);
            if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON6)) {
                // Already aligned
                return Cesium.Quaternion.IDENTITY;
            }
            Cesium.Cartesian3.normalize(axis, axis);
            return Cesium.Quaternion.fromAxisAngle(axis, angle);
        }, false)
    });
}

function addSatelliteSensor(satName, positionsOverTime) {
    viewer.entities.add({
        position: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            if (!satPos) return satPos;

            // Nadir direction: from satellite to Earth's center
            const nadir = Cesium.Cartesian3.negate(satPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nadir, nadir);

            // Offset cone center by -length/2 along nadir direction
            const length = 800000; // must match cylinder.length
            const offset = Cesium.Cartesian3.multiplyByScalar(nadir, length / 2, new Cesium.Cartesian3());
            // Offset the cone center by -length/2 along nadir direction
            // In Cesium, the cylinder is centered at its midpoint, so to have the base at the satellite position,
            // we need to offset the position by -length/2 * nadir direction.
            return Cesium.Cartesian3.add(satPos, offset, new Cesium.Cartesian3());
        }, false),
        outlineColor: Cesium.Color.BLACK,
        id: satName + "_sensor",
        cylinder: {
            length: 800000, // Sensor range (height of cone, meters)
            topRadius: 2000000, // Field of view radius at ground (meters)
            bottomRadius: 0.0,
            material: color,
            outline: false,
        },
        show: true,
        orientation: new Cesium.CallbackProperty(function (time, result) {
            // Get satellite position at current time
            const satPos = positionsOverTime.getValue(time);
            if (!satPos) return Cesium.Quaternion.IDENTITY;

            // Nadir direction: from satellite to Earth's center
            const nadir = Cesium.Cartesian3.negate(satPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nadir, nadir);

            // Default "up" for cylinder is +Z, so rotate Z to nadir
            const up = Cesium.Cartesian3.UNIT_Z;
            const axis = Cesium.Cartesian3.cross(up, nadir, new Cesium.Cartesian3());
            const angle = Cesium.Cartesian3.angleBetween(up, nadir);
            if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON6)) {
                // Already aligned
                return Cesium.Quaternion.IDENTITY;
            }
            Cesium.Cartesian3.normalize(axis, axis);
            return Cesium.Quaternion.fromAxisAngle(axis, angle);
        }, false)
    });
}

function viewInICRF() {
    viewer.camera.flyHome(0);
    viewer.scene.postUpdate.addEventListener(icrf);
    viewer.scene.globe.enableLighting = true;
}

function icrf(scene, time) {
    // Only apply ICRF transform when enabled (zoomed out)
    if (!icrfEnabled) {
        return;
    }

    if (scene.mode !== Cesium.SceneMode.SCENE3D) {
        return;
    }

    var icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);

    if (Cesium.defined(icrfToFixed)) {
        var camera = viewer.camera;
        var offset = Cesium.Cartesian3.clone(camera.position);
        var transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
        camera.lookAtTransform(transform, offset);
    }

}

function removeAllEntities() {
    satelliteStack = [];
    viewer.entities.removeAll();
}

colorTextArea.addEventListener('change', changeEntitiesColors);

function changeEntitiesColors() {
    if (satelliteStack.length === 0) {
        return;
    }
    const color = getSelectedColor();
    satelliteStack.forEach(satName => {
        if (satName.endsWith("0")) {
            viewer.entities.getById(satName + "_path").polyline.material = color;
        }
        viewer.entities.getById(satName + "_point").point.color = new Cesium.Color(color.red, color.green, color.blue, 1.0);
    });
}

function takeSnapshot() {
    const tmpH = cesiumContainer.style.height;
    const tmpW = cesiumContainer.style.width;

    // resize for screenshot
    cesiumContainer.style.height = "1200px";
    cesiumContainer.style.width = "1600px";
    viewer.resize();
    viewer.render();

    // chrome blocks opening data urls directly, add an image to a new window instead
    // https://stackoverflow.com/questions/45778720/window-open-opens-a-blank-screen-in-chrome
    const win = window.open();
    win.document.write(`<img src="${viewer.canvas.toDataURL("image/png")}" />`);
    win.stop();

    // reset viewer size
    cesiumContainer.style.height = tmpH;
    cesiumContainer.style.width = tmpW;
    viewer.resize();
    viewer.render();
}

clearButton.addEventListener('click', function () {
    removeAllEntities();
});

function elements2TLE(name, timestamp, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly) {

    // satelliteNumber, classification, timestamp, launchYear, launchPiece, launchNumber, meanMotionFirstDerivative, meanMotionSecondDerivative, bStar, elementNumber, ephemerisType
    const tleLine1 = buildLine1(1, 'U', new Date(timestamp), 2023, 'A', 92, 0, 0, 0, 123, 0);

    // satelliteNumber, semiMajorAxis, eccentricity, inclination, raan, pa, meanAnomaly, revolutionNumberAtEpoch
    const tleLine2 = buildLine2(1, semiMajorAxis, eccentricity, inclination, rightAscension, argumentOfPerigee, meanAnomaly, 12345);

    if (name === "") {
        name = randomName();
    }

    return name + '\r\n' + tleLine1 + '\r\n' + tleLine2;

}

function getSelectedColor() {
    const hexColor = colorTextArea.value;
    let color = Cesium.Color.fromCssColorString(hexColor)
    return color
}

function toggleSunlight() {
    if (viewer.scene.globe.enableLighting === true) {
        viewer.scene.globe.enableLighting = false;
    } else {
        viewer.scene.globe.enableLighting = true;
    }
}

function toggleLabels() {
    satelliteStack.forEach(element => {
        const label = viewer.entities.getById(element + "_label");
        if (label) {
            label.show = !label.show;
        }
    });
}

async function populateWalkerDelta() {

    removeAllEntities();

    // Get input elements and their values
    const semiMajorAxisElement = document.getElementById('semiMajorAxis');
    const inclinationElement = document.getElementById('inclination');
    const nOfPlanesElement = document.getElementById('nOfPlanes');
    const nOfSatsElement = document.getElementById('nOfSats');
    const phaseOffsetElement = document.getElementById('phaseOffset');

    // Check if all required elements exist
    if (!semiMajorAxisElement || !inclinationElement || !nOfPlanesElement || !nOfSatsElement || !phaseOffsetElement) {
        console.error("One or more required input elements not found in the DOM");
        alert("Error: Missing required input fields for Walker Delta constellation. Need: semi-major axis, inclination, number of planes, number of satellites, phase offset.");
        return;
    }

    // Get values and validate they're not empty
    const semiMajorAxisInput = semiMajorAxisElement.value.trim();
    const inclinationInput = inclinationElement.value.trim();
    const rightAscensionInput = 0;
    const argumentOfPerigeeInput = 0;
    const meanAnomalyInput = 0;
    const nOfPlanesInput = nOfPlanesElement.value.trim();
    const nOfSatsInput = nOfSatsElement.value.trim();
    const phaseOffsetInput = phaseOffsetElement.value.trim();

    // Parse and validate numeric values
    let semiMajorAxis = parseFloat(semiMajorAxisInput) + 6378; // Convert from altitude to semi-major axis in km;
    let inclination = parseFloat(inclinationInput);
    let rightAscension = parseFloat(rightAscensionInput);
    let argumentOfPerigee = parseFloat(argumentOfPerigeeInput);
    let meanAnomaly = parseFloat(meanAnomalyInput);
    let nOfPlanes = parseInt(nOfPlanesInput);
    let nOfSats = parseInt(nOfSatsInput);
    let phaseOffset = parseFloat(phaseOffsetInput);


    if (inclination < 0 || inclination > 180) {
        console.error("Invalid inclination: " + inclination);
        alert("Error: Inclination must be between 0 and 180 degrees.");
        return;
    }

    if (rightAscension < 0 || rightAscension >= 360) {
        while (rightAscension < 0) {
            rightAscension += 360;
        }
        while (rightAscension >= 360) {
            rightAscension -= 360;
        }
    } else if (isNaN(rightAscension)) {
        rightAscension = 0;
    }

    if (argumentOfPerigee < 0 || argumentOfPerigee >= 360) {
        while (argumentOfPerigee < 0) {
            argumentOfPerigee += 360;
        }
        while (argumentOfPerigee >= 360) {
            argumentOfPerigee -= 360;
        }
    } else if (isNaN(argumentOfPerigee)) {
        argumentOfPerigee = 0;
    }

    if (meanAnomaly < 0 || meanAnomaly >= 360) {
        while (meanAnomaly < 0) {
            meanAnomaly += 360;
        }
        while (meanAnomaly >= 360) {
            meanAnomaly -= 360;
        }
    } else if (isNaN(meanAnomaly)) {
        meanAnomaly = 0;
    }

    if (isNaN(phaseOffset)) {
        phaseOffset = 0;
    }

    // Validate constellation parameters
    if (nOfPlanes < 1 || nOfPlanes > 100) {
        console.error("Invalid number of planes: " + nOfPlanes);
        alert("Error: Number of planes must be between 1 and 100. Don't break my server plz.");
        return;
    }

    if (nOfSats < 1 || nOfSats > 10000) {
        console.error("Invalid number of satellites: " + nOfSats);
        alert("Error: Total number of satellites must be between 1 and 10,000. Don't break my server plz.");
        return;
    }

    if (nOfSats % nOfPlanes !== 0) {
        console.error("Satellites per plane not an integer: " + nOfSats + "/" + nOfPlanes);
        alert("Error: Total satellites must be evenly divisible by number of planes.");
        return;
    }

    const satsPerPlane = nOfSats / nOfPlanes;

    if (satsPerPlane < 1) {
        console.error("Too few satellites per plane: " + satsPerPlane);
        alert("Error: Must have at least 1 satellite per plane.");
        return;
    }

    let orbitalPeriodMinutes = getOrbitalPeriodMinutes(semiMajorAxis);


    // Calculate phasing within each plane (satellites evenly spaced)
    let phasing = 360 / satsPerPlane;

    // Calculate Walker Delta phase offset: Δθ = F × 360° / T
    // Note: User inputs F as degrees directly, so we use it directly as the phase offset
    // rather than multiplying by 360/T (which would be for unitless F factor)
    let walkerPhaseOffset = phaseOffset; // Direct degree input

    // Set consistent time window for entire constellation
    const today = new Date();
    today.setMilliseconds(0);
    today.setSeconds(0);
    picker.setStartDate(today);
    picker.setEndDate(shiftDateByMinutes(today, Math.ceil(orbitalPeriodMinutes) * 1.1)); // 10% margin over one orbit
    await updateGlobalDates();

    // Lock down the time window before any propagation
    const constellationStartTime = picker.getStartDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    const constellationEndTime = picker.getEndDate().format("YYYY-MM-DDTHH:mm:ss.sssZ");

    const timestamp = new Date(constellationStartTime).getTime();

    // Generate all TLEs first to avoid clock interference
    const satelliteTLEs = [];

    let showLabels = true;

    if (nOfSats >= 500) {
        timestepInSeconds = 60; // 1 minute for large constellations
        showLabels = false;
        // Disable and uncheck the labels checkbox for large constellations
        showLabelsCheckbox.disabled = true;
        showLabelsCheckbox.checked = false;
    } else {
        // Enable and check the labels checkbox for smaller constellations
        showLabelsCheckbox.disabled = false;
        showLabelsCheckbox.checked = true;
    }

    for (let plane = 0; plane < nOfPlanes; plane++) {
        // RAAN: evenly distribute planes around the equator
        let raan = (plane * (360 / nOfPlanes) + rightAscension) % 360;

        // Apply Walker Delta phase offset to this plane
        // Each plane is offset by plane_index × walkerPhaseOffset in mean anomaly
        let planePhaseOffset = (plane * walkerPhaseOffset) % 360;

        for (let sat = 0; sat < satsPerPlane; sat++) {
            // Mean anomaly: base + satellite spacing within plane + Walker Delta phase offset
            let anomaly = (meanAnomaly + sat * phasing + planePhaseOffset) % 360;
            const satName = `P${plane}_S${sat}`;
            let tle = elements2TLE(satName, timestamp, semiMajorAxis, 0.0001, inclination, raan, argumentOfPerigee, anomaly);

            let plotOptions = {
                point: true,
                path: false,
                label: showLabels
            };

            if (sat === 0) {
                plotOptions.path = true; // Only show path for first satellite in each plane
            }

            satelliteTLEs.push({
                name: satName,
                tle: tle,
                plane: plane,
                sat: sat,
                anomaly: anomaly,
                plotOptions: plotOptions
            });
        }
    }

    for (let satData of satelliteTLEs) {
        await propagateAndRenderWalkingDelta(satData.tle, timestepInSeconds, iso8601Start, iso8601End, satData.plotOptions);
    }

    viewer.clock.shouldAnimate = true;
    
}

showSunlightCheckbox.addEventListener('change', toggleSunlight);

showLabelsCheckbox.addEventListener('change', toggleLabels);

takeSnapshotButton.addEventListener('click', takeSnapshot);

populateWalkerDeltaButton.addEventListener('click', async function () {
    try {
        await populateWalkerDelta();
    } catch (error) {
        console.error("Error in populateWalkerDelta:", error);
        alert("Error generating Walker Delta constellation: " + error.message);
    }
});