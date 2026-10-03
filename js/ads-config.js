// Ad settings. Ads are switched OFF while these are empty: the ad box stays hidden.
//
// To switch ads on: in Adsterra, create a "Banner" ad unit for each size below. Each unit's
// code contains a line like
//   <script src="//www.highperformanceformat.com/0123456789abcdef0123456789abcdef/invoke.js"></script>
// Paste that src address between the quotes for the matching size, then redeploy.
// Only plain banner units go here. Pop-unders and "social bar" units are not supported.

window.ADS = {
  banners: {
    '468x60': '',   // below the generator, on tablets and computers
    '320x50': ''    // below the generator, on phones
  }
};
