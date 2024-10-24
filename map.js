d3.csv('data/workforce_training_cleaned.csv').then(function (data) {

    var geojson = {
        type: "FeatureCollection",
        features: data.map(function (d, index) {  // Use index as a fallback ID
            // Replace "NA" or undefined values in organization_type with a default value
            var organizationType = (d["Organization Type"] || "Unknown").trim();
            
            return {
                type: "Feature",
                id: d.org_id || index,  // Add unique ID
                geometry: {
                    type: "Point",
                    coordinates: [parseFloat(d.geo_lon), parseFloat(d.geo_lat)]
                },
                properties: {
                    org_name: d.org_name,
                    org_address: d.org_address,
                    organization_type: organizationType,
                    state: d.state
                }
            };
        }).filter(function (d) {
            // Filter out any records that still have undefined coordinates or organization_type
            return d.geometry.coordinates.every(coord => !isNaN(coord)) && d.properties.organization_type !== "NA";
        })
    };

    var organizationTypeColors = {
        "Non-profit organization": "#7F5A83",
        "Higher education institution": "#E8D0A9",
        "Registered apprenticeship": "#01B3CA",
        "WIOA-eligible": "#76A08A",
        "Multiple types": "#E06D10",  
        "Unknown": "#C34121", 
        "default": "#3FB1CE"
    };

    // Add the workforce data as a source and layer once the map is loaded
    map.on('load', function () {
        map.addSource('workforceTrainingData', {
            'type': 'geojson',
            'data': geojson
        });

        // Add a layer for data points
        map.addLayer({
            'id': 'workforce-points',
            'type': 'circle',
            'source': 'workforceTrainingData',
            'paint': {
                'circle-color': [
                    'match',
                    ['get', 'organization_type'],
                    'Non-profit organization', organizationTypeColors['Non-profit organization'],
                    'Higher education institution', organizationTypeColors['Higher education institution'],
                    'Registered apprenticeship', organizationTypeColors['Registered apprenticeship'],
                    'WIOA-eligible', organizationTypeColors['WIOA-eligible'],
                    'Multiple types', organizationTypeColors['Multiple types'],
                    'Unknown', organizationTypeColors['Unknown'],
                    organizationTypeColors['default']
                ],
                'circle-radius': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false], 6,  
                    4  // Default circle radius
                ]
            }
        });

        // Create the tooltip function
        var popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false
        });

        // When mouse hovers, show the tooltip and increase circle radius for the specific point
        var hoveredStateId = null;

        map.on('mouseenter', 'workforce-points', function (e) {
            map.getCanvas().style.cursor = 'pointer';  // Change cursor to pointer

            // Get the first feature under the pointer
            var features = map.queryRenderedFeatures(e.point, {
                layers: ['workforce-points']
            });

            if (!features.length) {
                return;
            }

            var feature = features[0];

            // Set the hover state for this feature
            if (hoveredStateId !== null) {
                map.setFeatureState({ source: 'workforceTrainingData', id: hoveredStateId }, { hover: false });
            }
            hoveredStateId = feature.id;
            map.setFeatureState({ source: 'workforceTrainingData', id: hoveredStateId }, { hover: true });

            var coordinates = feature.geometry.coordinates.slice();
            var orgName = feature.properties.org_name;
            var orgAddress = feature.properties.org_address;
            var orgType = feature.properties.organization_type;

            // Tooltip contents
            var popupContent = '<h4>' + orgName + '</h4>' +
                '<p>Address: ' + orgAddress + '</p>' +
                '<p>Organization Type: ' + orgType + '</p>';

            // Add the tooltip to the map
            popup
                .setLngLat(coordinates)
                .setHTML(popupContent)
                .addTo(map);
        });

        // When mouse leaves the point, reset the hover state and remove the tooltip
        map.on('mouseleave', 'workforce-points', function () {
            map.getCanvas().style.cursor = '';  // Reset the cursor to default
            popup.remove();  // Remove the popup

            // Remove the hover state for the previously hovered feature
            if (hoveredStateId !== null) {
                map.setFeatureState({ source: 'workforceTrainingData', id: hoveredStateId }, { hover: false });
            }
            hoveredStateId = null;
        });

        // Add event listeners to checkboxes for filtering points
        var checkboxes = document.querySelectorAll('#organization-types input[type=checkbox]');
        checkboxes.forEach(function (checkbox) {
            checkbox.addEventListener('change', filterPoints);
        });

        // Function to filter points based on checkbox selection
        function filterPoints() {
            var selectedTypes = Array.from(checkboxes)
                .filter(function (checkbox) {
                    return checkbox.checked;
                })
                .map(function (checkbox) {
                    return checkbox.value;
                });

            console.log("Selected organization types for filtering:", selectedTypes);  // Log selected types

            // If no types are selected, show all points
            if (selectedTypes.length === 0) {
                map.setFilter('workforce-points', null);  // Show all points when no filters are selected
            } else {
                // Apply filter to the map based on selected organization types
                map.setFilter('workforce-points', ['in', ['get', 'organization_type'], ['literal', selectedTypes]]);
            }
        }

    });
});


//////////////////////////////////////////////////////////////////////////////////////////////////


// Load the state boundaries GeoJSON data
const stateBoundariesUrl = 'path_to_state_boundaries_geojson'; 

map.on('load', function () {
    // Fetch the GeoJSON and assign unique IDs to each feature
    fetch(stateBoundariesUrl)
        .then(response => response.json())
        .then(data => {
            // Assign unique IDs to each feature for hover and click events
            data.features.forEach((feature, i) => {
                feature.id = i;  // Assign a unique ID to each feature
            });

            // Add the state boundaries source
            map.addSource('stateBoundaries', {
                'type': 'geojson',
                'data': data
            });

            // Add a layer to show the state boundaries
            map.addLayer({
                'id': 'state-boundaries',
                'type': 'line',
                'source': 'stateBoundaries',
                'paint': {
                    'line-color': '#f5f5f5',
                    'line-width': 2
                }
            });

            // Initially hide the state boundaries
            map.setLayoutProperty('state-boundaries', 'visibility', 'none');
        });
});

// Load the ACS data for displaying state information
d3.csv('data/acs_data_cleaned.csv').then(function (dataset) {
    // Add an event listener for when the user selects a state
    document.getElementById('stateDropdown').addEventListener('change', function () {
        const selectedState = this.value;

        // Show state boundaries
        map.setLayoutProperty('state-boundaries', 'visibility', 'visible');

        // Query the selected state from the GeoJSON source
        const stateFeature = map.querySourceFeatures('stateBoundaries', {
            filter: ['==', 'NAME', selectedState]  // Ensure this matches the property name in the GeoJSON
        });

        // Check if the state feature was found and zoom to its bounding box
        if (stateFeature.length) {
            const stateBounds = turf.bbox(stateFeature[0]);  // Assuming you have Turf.js included
            map.fitBounds(stateBounds, {
                padding: 20
            });
        } else {
            console.error(`State ${selectedState} not found in the geojson data.`);
        }

        // Display the state information in the sidebar
        displayStateInfo(selectedState, dataset);
    });
});

function displayStateInfo(stateName, dataset) {
    const stateData = dataset.find(state => state.State === stateName);

    if (!stateData) {
        console.error(`State data not found for ${stateName}`);
        return;
    }

    const stateInfoHtml = `
        <h3>State: ${stateData.State}</h3>
        <p>Unemployment rate: ${stateData['Unemployment rate']}</p>
        <p>Poverty rate: ${stateData['Poverty rate']}</p>
        <p>Population identified as POC: ${stateData['Population identified as POC']}</p>
        <p>Total population: ${stateData['Total population']}</p>
        <p>Population with less than Bachelor's degree: ${stateData['Population with less than Bachelor\'s degree']}</p>
        <p>Per Capita Personal Income: ${stateData['Per Capita Personal Income']}</p>
    `;

    // Update the sidebar with the state information
    document.getElementById('state-info').innerHTML = stateInfoHtml;
}
