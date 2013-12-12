(function ($) {
    $.fn.storeLocator = function (options) {

        var settings = $.extend({
            'mapDiv': 'map',
            'listDiv': 'list',
            'formID': 'user-location',
            'pinColor': 'fe7569',
            'startPinColor': '66bd4a',
            'pinTextColor': '000000',
            'storeLimit': 10,
            'distanceAlert': 60,
            'xmlLocation': 'data/stores.xml',
            'addressErrorMsg': 'Please enter valid UK address address or postcode',
            'googleDistanceMatrixDestinationLimit': 25,
            'defaultLat': 52.3038165,
            'defaultLng': -1.081117,
            'defaultLocationName': 'Northampton, United Kingdom'
        }, options);

        return this.each(function () {
            var $this = $(this);

            // global array of shop objects
            var _locationset = new Array();
            var geocoder;

            // Calculate distances from passed in origin to all locations in the [_locationset] array
            // using Google Maps Distance Matrix Service https://developers.google.com/maps/documentation/javascript/reference#DistanceMatrixService
            var GeoCodeCalc = {};
            GeoCodeCalc.CalcDistanceGoogle = function (origin, callback) {
                var destCoordArr = new Array();
                var subFunctionTokens = [];

                $.each(_locationset, function (ix, loc) {
                    destCoordArr.push(loc.LatLng);
                });

                for (var i = 0; i < destCoordArr.length; i = i + settings.googleDistanceMatrixDestinationLimit) { // Google Distance Matrix allows up to 25 destinations to be passed in
                    var tempArr = destCoordArr.slice(i, Math.min(i + settings.googleDistanceMatrixDestinationLimit));
                    subFunctionTokens.push(this.CallGoogleDistanceMatrix(i, origin, tempArr));
                }

                $.when.apply($, subFunctionTokens)
                      .then(function () {
                          callback(true);
                      });
            };

            GeoCodeCalc.CallGoogleDistanceMatrix = function (startIndex, origin, destinations) {
                var token = $.Deferred();
                var service = new google.maps.DistanceMatrixService();
                service.getDistanceMatrix(
                  {
                      origins: [origin],
                      destinations: destinations,
                      travelMode: google.maps.TravelMode.DRIVING,
                      unitSystem: google.maps.UnitSystem.IMPERIAL
                  }, function (response, status) {
                      if (response && response.rows.length) {
                          var results = response.rows[0].elements;
                          $.each(results, function (j, val) {
                              if (results[j].status != "ZERO_RESULTS") {
                                  _locationset[startIndex + j].Distance = GoogleMapDistanceTextToNumber(results[j].distance.text);
                              }
                          });

                          token.resolve();
                      }
                  });

                return token.promise();
            };

            // Converts "123.45 mi" into 123.45
            function GoogleMapDistanceTextToNumber(str) {
                return Number(str.replace(/[^0-9.]/g, ""));
            }

            // removes Google Maps URL unfriendly chars from a string
            function formatGoogleMapUrlString(str) {
                return str.replace("&", "%26").replace(" ", "+");
            }

            //Geocode function for the origin location
            geocoder = new google.maps.Geocoder();
            function GoogleGeocode() {
                this.geocode = function (address, callbackFunction) {
                    geocoder.geocode({ 'address': address }, function (results, status) {
                        if (status == google.maps.GeocoderStatus.OK) {
                            var result = {};
                            result.latitude = results[0].geometry.location.lat();
                            result.longitude = results[0].geometry.location.lng();
                            result.formatted_address = results[0].formatted_address;
                            result.address_components = results[0].address_components;
                            callbackFunction(result);
                        } else {
                            handleError("Geocode was not successful for the following reason: " + status);
                            callbackFunction(null);
                        }
                    });
                };

                this.geocodeLatLng = function (LatLng, callbackFunction) {
                    geocoder.geocode({ 'location': LatLng }, function (results, status) {
                        if (status == google.maps.GeocoderStatus.OK && results.length) {
                            callbackFunction(results[0]);
                        } else {
                            handleError("Geocode was not successful for the following reason: " + status);
                            callbackFunction(null);
                        }
                    });
                };
            }

            //Process form input
            $(function () {
                $(document).on('submit', '#' + settings.formID, function (e) {
                    $("#lblError").html("");
                    //Stop the form submission
                    e.preventDefault();
                    //Get the user input and use it
                    var userinput = $('form').serialize();
                    userinput = userinput.replace("address=", "");
                    if (userinput == "") {
                        handleError(settings.addressErrorMsg);
                    }

                    var g = new GoogleGeocode();
                    var address = userinput;
                    g.geocode(address, function (data) {
                        if (data != null) {
                            showAddress(data);
                            mapping(data.latitude, data.longitude);
                        } else {
                            //Unable to geocode
                            handleError(settings.addressErrorMsg);
                        }
                    });

                    //Replace spaces in user input
                    userinput = formatGoogleMapUrlString(userinput);
                });
            });

            $(document).ready(function () {
                // Try HTML5 geolocation
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(function (position) {
                        //map.setCenter(pos);
                        var g = new GoogleGeocode();
                        var latlng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);

                        g.geocodeLatLng(latlng, function (address) {
                            if (address) {
                                showAddress(address);
                            } else {
                                //Unable to geocode
                                handleNoGeolocation('Error: Unable to geocode address');
                            }
                        });

                        // do the mapping stuff
                        mapping(position.coords.latitude, position.coords.longitude);

                    }, function () {
                        handleNoGeolocation("Tracking of location was not allowed.");
                    });
                } else {
                    // Browser doesn't support Geolocation
                    handleNoGeolocation(false);
                }
            });

            function showAddress(address) {
                $("#lblAddress").html(address.formatted_address);
                // find a postcode and show it in the address textbox
                $.each(address.address_components, function (i, val) {
                    if (val.types[0] == "postal_code") {
                        $("#address").val(val.short_name);
                        return false; // breaks the each() loop
                    }
                });
            }

            function handleNoGeolocation(error) {
                if (error) {
                    var content = error;
                } else {
                    var content = 'Error: Your browser doesn\'t support geolocation.';
                }

                handleError(content + " Using default location.");
                mapping(settings.defaultLat, settings.defaultLng);
                $("#lblAddress").html(settings.defaultLocationName);

            }

            function handleError(error) {
                $("#lblError").html(error);
            }

            //Now all the mapping stuff
            function mapping(orig_lat, orig_lng) {
                $(function () {
                    //Parse xml with jQuery
                    $.ajax({
                        type: "GET",
                        url: settings.xmlLocation,
                        dataType: "xml",
                        success: function (xml) {
                            _locationset = new Array();
                            $(xml).find('Placemark').each(function (i) {
                                var shop = {
                                    Name: $(this).find('name').text(),
                                    //Take the lat lng from the user, geocoded above
                                    LatLng: new google.maps.LatLng(
                                        $(this).find('coordinates').text().split(",")[1],
                                        $(this).find('coordinates').text().split(",")[0]),
                                    Description: $(this).find('description').text(),
                                    Marker: null,
                                    Distance: null
                                };
                                _locationset.push(shop);
                            });

                            // Calc Distances from user's location
                            GeoCodeCalc.CalcDistanceGoogle(new google.maps.LatLng(orig_lat, orig_lng), function (success) {
                                if (!success) { //something went wrong
                                    handleError("Unable to calculate distances at this time");
                                }
                                else {
                                    //Sort the multi-dimensional array numerically
                                    _locationset.sort(function (a, b) {
                                        return ((a.Distance < b.Distance) ? -1 : ((a.Distance > b.Distance) ? 1 : 0));
                                    });

                                    // take "N" closest shops
                                    _locationset = _locationset.slice(0, settings.storeLimit);

                                    //Check the closest marker
                                    if (_locationset[0].Distance > settings.distanceAlert) {
                                        handleError("Unfortunately, our closest location is more than " + settings.distanceAlert + " miles away.");
                                    }

                                    //Create the map with jQuery
                                    $(function () {
                                        var orig_LatLng = new google.maps.LatLng(orig_lat, orig_lng);
                                        //Google maps settings
                                        var myOptions = {
                                            center: orig_LatLng,
                                            mapTypeId: google.maps.MapTypeId.ROADMAP
                                        };

                                        var map = new google.maps.Map(document.getElementById(settings.mapDiv), myOptions);
                                        //Create one infowindow to fill later
                                        var infowindow = new google.maps.InfoWindow();

                                        //Add user location marker
                                        var marker = createMarker(orig_LatLng, "0", settings.startPinColor);
                                        marker.setAnimation(google.maps.Animation.DROP);
                                        var bounds = new google.maps.LatLngBounds();
                                        bounds.extend(orig_LatLng);

                                        $("#" + settings.listDiv).empty();

                                        $(_locationset).each(function (i, location) {
                                            bounds.extend(location.LatLng);
                                            letter = String.fromCharCode("A".charCodeAt(0) + i);
                                            location.Marker = createMarker(location.LatLng, letter, settings.pinColor);
                                            create_infowindow(location);
                                            listClick(letter, location);
                                        });

                                        // zoom in/out to show all markers
                                        map.fitBounds(bounds);

                                        function listClick(letter, shop) {
                                            $('<li />').html("<div class=\"list-details\"><div class=\"list-content\">"
                                            + "<div class=\"list-label\">" + letter + "<\/div>"
                                            + "<div class=\"loc-name\">" + shop.Name + "<\/div> <div class=\"loc-addr\">" + shop.Description + "<\/div>"
                                            + (shop.Distance ? "<div class=\"loc-addr2\"><i>approx. " + shop.Distance + " miles</i><\/div>" : "")
                                            + "<div class=\"loc-web\"><a href=\"http://maps.google.co.uk/maps?saddr="
                                            + formatGoogleMapUrlString($("#address").val()) + "+%40" + orig_lat + "," + orig_lng
                                            + "&daddr=" + formatGoogleMapUrlString(shop.Name) + "+%40" + shop.LatLng.lat() + "," + shop.LatLng.lng()
                                            + "&hl=en" + "\" target=\"_blank\">&gt;Get directions</a><\/div><\/div><\/div>")
                                            .click(function () {
                                                create_infowindow(shop, "left");
                                            }).appendTo("#" + settings.listDiv);
                                        };

                                        //Custom marker function - aplhabetical
                                        function createMarker(point, letter, pinColor) {
                                            //Set up pin icon with the Google Charts API for all of our markers
                                            var pinImage = new google.maps.MarkerImage("http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + letter + "|" + pinColor + "|" + settings.pinTextColor,
                                              new google.maps.Size(21, 34),
                                              new google.maps.Point(0, 0),
                                              new google.maps.Point(10, 34));
                                            var pinShadow = new google.maps.MarkerImage("http://chart.apis.google.com/chart?chst=d_map_pin_shadow",
                                              new google.maps.Size(40, 37),
                                              new google.maps.Point(0, 0),
                                              new google.maps.Point(12, 35));

                                            //Create the markers
                                            return new google.maps.Marker({
                                                position: point,
                                                map: map,
                                                icon: pinImage,
                                                shadow: pinShadow,
                                                draggable: false
                                            });
                                        };

                                        //Infowindows
                                        function create_infowindow(shop, listLocation) {
                                            var formattedAddress = "<div class=\"infoWindow\"><b>" + shop.Name + "<\/b>"
                                            + "<div>" + shop.Description + "<\/div>"
                                            + (shop.Distance ? "<div><i>" + shop.Distance + " miles<\/i><\/div><\/div>" : "<\/div>");

                                            //Opens the infowindow when list item is clicked
                                            if (listLocation == "left") {
                                                infowindow.setContent(formattedAddress);
                                                infowindow.open(shop.Marker.get(settings.mapDiv), shop.Marker);
                                            }
                                            //Opens the infowindow when the marker is clicked
                                            else {
                                                google.maps.event.addListener(shop.Marker, 'click', function () {
                                                    infowindow.setContent(formattedAddress);
                                                    infowindow.open(shop.Marker.get(settings.mapDiv), shop.Marker);
                                                })
                                            }
                                        };
                                    });
                                }
                            });
                        }
                    });
                });
            }

        });
    };
})(jQuery);