import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, FontSize, Radius } from '../constants/theme';

interface Props {
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  startAddress?: string;
  endAddress?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
  height?: number;
}

function buildMapHTML(props: Props): string {
  const { startLat, startLng, endLat, endLng, startAddress = 'Start', endAddress = 'End', waypoints = [] } = props;

  const hasBoth = !!(endLat && endLng);
  const wpCoords = waypoints.length > 0
    ? waypoints.map(w => `[${w.lat},${w.lng}]`).join(',')
    : '';

  const routeLine = hasBoth
    ? `L.polyline([[${startLat},${startLng}],${wpCoords ? wpCoords + ',' : ''}[${endLat},${endLng}]],{color:'#3B82F6',weight:4,opacity:0.85,dashArray:'8,5'}).addTo(map);`
    : '';

  const endMarker = hasBoth
    ? `L.marker([${endLat},${endLng}],{icon:endIcon}).bindPopup('<b>End</b><br/>${endAddress.replace(/'/g, "\\'")}').addTo(map);`
    : '';

  const fitBounds = hasBoth
    ? `map.fitBounds([[${startLat},${startLng}],[${endLat},${endLng}]],{padding:[40,40]});`
    : `map.setView([${startLat},${startLng}],14);`;

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{height:100%;margin:0;padding:0;background:#09090B}
.leaflet-container{background:#09090B}
.leaflet-control-zoom{border:none!important}
.leaflet-control-zoom a{background:#27272A!important;color:#FAFAFA!important;border:1px solid #3F3F46!important}
</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18,subdomains:'abcd'}).addTo(map);
var startIcon=L.divIcon({className:'',html:'<div style="width:16px;height:16px;border-radius:50%;background:#10B981;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.6)"></div>',iconSize:[16,16],iconAnchor:[8,8]});
var endIcon=L.divIcon({className:'',html:'<div style="width:16px;height:16px;border-radius:50%;background:#F43F5E;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.6)"></div>',iconSize:[16,16],iconAnchor:[8,8]});
L.marker([${startLat},${startLng}],{icon:startIcon}).bindPopup('<b>Start</b><br/>${startAddress.replace(/'/g, "\\'")}').addTo(map);
${endMarker}
${routeLine}
${fitBounds}
</script>
</body></html>`;
}

export default function TripMapView({ startLat, startLng, endLat, endLng, startAddress, endAddress, waypoints, height = 220 }: Props) {
  const [mapLoading, setMapLoading] = useState(true);

  if (!startLat || !startLng) {
    return (
      <View testID="map-placeholder" style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderIcon}>📍</Text>
        <Text style={styles.placeholderText}>No GPS coordinates recorded</Text>
        <Text style={styles.placeholderSub}>GPS tracking captures route on next trip</Text>
      </View>
    );
  }

  const html = buildMapHTML({ startLat, startLng, endLat, endLng, startAddress, endAddress, waypoints });

  return (
    <View testID="trip-map" style={[styles.container, { height }]}>
      {mapLoading && (
        <View style={styles.mapLoader}>
          <ActivityIndicator size="small" color={Colors.brand.primary} />
          <Text style={styles.mapLoaderText}>Loading map...</Text>
        </View>
      )}
      <WebView
        source={{ html }}
        style={[styles.webview, mapLoading && { opacity: 0 }]}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        mixedContentMode="always"
        onLoadEnd={() => setMapLoading(false)}
        onError={() => setMapLoading(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.bg.secondary,
  },
  mapLoader: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    zIndex: 10,
    gap: 8,
  },
  mapLoaderText: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
  },
  placeholder: {
    borderRadius: Radius.xl,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  placeholderIcon: { fontSize: 28 },
  placeholderText: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600' },
  placeholderSub: { color: Colors.text.tertiary, fontSize: FontSize.xs, textAlign: 'center', paddingHorizontal: 24 },
});
