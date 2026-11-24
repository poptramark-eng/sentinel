// The cbe theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in cbe.settings.json and the generated cbe.settings.ts;
// change them with `astryx experimental theme editor set cbe ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {cbeSettings} from './cbe.settings';

export const cbeTheme = defineTheme({
  extends: cbeSettings,
  name: 'cbe',
});
