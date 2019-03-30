// sno：站點代號、 sna：場站名稱(中文)、 tot：場站總停車格、
// sbi：場站目前車輛數量、 sarea：場站區域(中文)、 mday：資料更新時間、
// lat：緯度、 lng：經度、 ar：地址(中文)、 sareaen：場站區域(英文)、
// snaen：場站名稱(英文)、 aren：地址(英文)、 bemp：空位數量、 act：全站禁用狀態

var bikeStopUrl = 'https://tcgbusfs.blob.core.windows.net/blobyoubike/YouBikeTP.gz';
var map = undefined;

var vm = new Vue({
    el: "#app",
    data: {
        search: "",
        ubikeStops: [],
        statusColors: {
            Operational: '#8ADB2C',
            OutOfVehicles: '#FFA028',
            NoVacancy: '#FF4A01',
            Suspended: '#727272'
        },
        markers: [],
        infoWindows: [],
        userLocation: {
            lat: 25.06,
            lng: 121.55
        },
        userLocMarker: undefined,
        zoom: 13,
        showList: true,
    },
    filters: {
        distanceFormat: function(value) {
            return value < 1000 ? `${value.toFixed(0)} 公尺` : `${(value/1000).toFixed(2)} 公里`;
        },
        timeFormat: function( t ) {  
            return this.getTimeFormat(t); 
        }
    },
    created() {
        var self = this,
            stopsData = [];
        axios.get(bikeStopUrl).then(resp => {
            // 將 json 轉陣列
            stopsData = Object.keys(resp.data.retVal).map(key => resp.data.retVal[key]);

            // 資料預處理後存入 this.ubikeStops
            self.ubikeStops = self.data_clean(stopsData);
        });

        // 初始化 google map
        google.maps.event.addDomListener(window, 'load', this.map_initialize);

        // 取得使用者當前位置
        this.setCurrentLocation();
    },
    computed: {
        filterStops: function () {
            var self = this;

            // 依照關鍵字篩選
            return self.ubikeStops.filter(s => {
                return s.sna.indexOf(self.search) > -1 ||
                    s.ar.indexOf(self.search) > -1 ||
                    s.snaen.indexOf(self.search) > -1 ||
                    s.aren.indexOf(self.search) > -1
            });
        }
    },
    watch: {
        search: function () {
            // 關鍵字改變後重新處理 marker
            this.addMakers();
        },
        ubikeStops: function () {
            // 更新 markers
            this.addMakers();
        },
        userLocation: function() {
            this.setSelfLocIcon(this.userLocation.lat, this.userLocation.lng);
        },

    },
    methods: {
        data_clean: function (data) {
            var self = this;

            // 設定距離及顏色
            data.forEach((stop, k) => {
                data[k].distance = self.getDistance({
                    lat: stop.lat,
                    lng: stop.lng
                }, self.userLocation);
                data[k].color = self.getMarkColor(stop);
            })

            // 依照關鍵字篩選並排序
            return data.filter(s => {
                return s.sna.indexOf(self.search) > -1 ||
                    s.ar.indexOf(self.search) > -1 ||
                    s.snaen.indexOf(self.search) > -1 ||
                    s.aren.indexOf(self.search) > -1
            }).sort((a, b) => {
                return a.distance - b.distance;
            });
        },
        setCurrentLocation: function () {
            var self = this;
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(position => {
                    self.userLocation.lat = position.coords.latitude;
                    self.userLocation.lng = position.coords.longitude;
                    self.zoom = 16;

                    self.setSelfLocIcon(position.coords.latitude, position.coords.longitude);
                });
            }
        },
        map_initialize: function () {
            var mapOptions = {
                center: new google.maps.LatLng(this.userLocation.lat, this.userLocation.lng),
                zoom: this.zoom,
                fullscreenControl: false,
                mapTypeControl: false,
                scaleControl: false,
            };

            if (map === undefined) {
                map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);
            }

            this.setCenterControl();
            this.addMakers();
        },
        setCenterControl: function () {
            var self = this;
            var centerControlDiv = document.getElementById('center-btn');
            centerControlDiv.addEventListener('click', () => {
                map.setCenter(self.userLocation);
                map.setZoom(16);
            });
        },
        setSelfLocIcon: function (lat, lng) {
            if (!map) return;

            if (this.userLocMarker) userLocMarker.setMap(null);
            var selfLocMarker = new google.maps.Marker({
                position: { lat, lng },
                map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#5DBA9D',
                    fillOpacity: 1,
                    strokeColor: '#808680',
                    strokeWeight: 1,
                    scale: 8,
                },
            });
            this.userLocMarker = selfLocMarker;

            //設定初始的 center 和 zoom level
            map.setCenter({ lat, lng });
            map.setZoom(16);
        },
        addMakers: function () {
            var position, title, content, iconColor;

            // 清除已存在的 marker
            if (this.markers.length !== 0) {
                this.markers.forEach(m => m.setMap(null));
                this.markers = [];
            }

            // 準備 marker 及 infoWindow 相關資訊
            this.filterStops.forEach(el => {
                iconColor = el.color;
                position = {
                    lat: Number(el.lat),
                    lng: Number(el.lng),
                };
                title = el.sna;
                content = `
                    <h4>${el.sna}</h4>
                    ${el.ar}<br><br>
                    可借車輛: ${el.sbi}<br>
                    可停空位: ${el.bemp}<br>
                    總停車格: ${el.tot}<br>
                    更新時間: ${this.getTimeFormat(el.mday)}
                `;

                this.setEachMarker(map, position, title, content, iconColor);
            });
        },
        setEachMarker: function (map, position, title, content, color) {
            var self = this;

            var marker = new google.maps.Marker({
                position,
                map,
                title,
                icon: this.pinSymbol(color),
            });

            var infoWindow = new google.maps.InfoWindow({
                content: `<div style="overflow: hidden;">${content}</div>`,
                maxWidth: 350,
            });

            google.maps.event.addDomListener(marker, 'click', () => {
                // 自動關閉其他 infoWindow
                self.infoWindows.forEach(infoObj => {
                    if (infoObj) infoObj.close();
                });

                // 開啟 infoWindow
                infoWindow.open(map, marker);
            });

            self.markers.push(marker);
            self.infoWindows.push(infoWindow);
        },
        showStopInfo: function (stop) {
            var target_marker = this.markers.filter(marker => marker.title === stop.sna);

            google.maps.event.trigger(target_marker[0], 'click');
            map.setCenter({
                lat: Number(stop.lat),
                lng: Number(stop.lng)
            });
            map.setZoom(16);
        },
        getMarkColor: function (el) {
            if (el.act !== "1" || (el.sbi === "0" && el.bemp === "0")) return this.statusColors.Suspended;
            if (el.sbi === "0") return this.statusColors.OutOfVehicles;
            if (el.bemp === "0") return this.statusColors.NoVacancy;
            return this.statusColors.Operational;
        },
        getTimeFormat: function (t) {
            var date = [], time = [];

            date.push(t.substr(0, 4));
            date.push(t.substr(4, 2));
            date.push(t.substr(6, 2));
            time.push(t.substr(8, 2));
            time.push(t.substr(10, 2));
            time.push(t.substr(12, 2));

            return date.join("/") + ' ' + time.join(":");
        },
        pinSymbol: function (color) {
            return {
                path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
                fillColor: color,
                fillOpacity: 1,
                strokeColor: '#4f4f4f',
                strokeWeight: 1.5,
                scale: 1,
            };
        },
        getDistance: function (p1, p2) {
            var R = 6378137; // Earth’s mean radius in meter
            var dLat = this.rad(p2.lat - p1.lat);
            var dLong = this.rad(p2.lng - p1.lng);
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(this.rad(p1.lat)) * Math.cos(this.rad(p2.lat)) *
                Math.sin(dLong / 2) * Math.sin(dLong / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            var d = R * c;
            return d; // returns the distance in meter
        },
        rad: function (x) {
            return x * Math.PI / 180;
        }
    }
})