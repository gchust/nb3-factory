/**
 * Fictional internal device manuals shipped with the application.
 *
 * They are TypeScript rather than loose Markdown files so a production build
 * carries them into `dist` without a copy step, and so the AI Knowledge Base
 * manifest has a stable, importable source of truth.
 */
export interface DeviceManual {
  readonly slug: string;
  readonly title: string;
  readonly deviceModel: string;
  readonly summary: string;
  readonly content: string;
}

/**
 * Key of the internal device-manual knowledge base, shared by the AI Knowledge
 * Base provisioner and the Service Assistant's knowledge-base binding.
 */
export const DEVICE_MANUAL_KNOWLEDGE_BASE_KEY = 'device-manuals';

/**
 * Disk-relative directory the manuals are copied into for the AI Knowledge
 * Base manifest to ingest. The value is a location within the `local` Drive
 * disk, not a filesystem path.
 */
export const DEVICE_MANUAL_DRIVE_DIRECTORY = 'preload/device-manuals';

export const DEVICE_MANUALS: readonly DeviceManual[] = [
  {
    slug: 'aqua-pure-x200',
    title: 'AquaPure X200 Water Purifier Service Manual',
    deviceModel: 'AQ-X200',
    summary:
      'Filter replacement, low-pressure alarm reset and leak handling for the AquaPure X200.',
    content: [
      '# AquaPure X200 Service Manual',
      '',
      '## 1. Filter replacement',
      '1. Close the inlet valve and open the RO faucet to release pressure.',
      '2. Twist the first-stage sediment cartridge a quarter turn counter-clockwise.',
      '3. Fit the replacement cartridge and twist clockwise until it seats.',
      '4. Open the inlet valve slowly and flush for five minutes.',
      '',
      '## 2. Low-pressure alarm (E03)',
      '- E03 means inlet pressure below 0.1 MPa for more than 30 seconds.',
      '- Check the pre-filter for sediment and the feed line for a kink.',
      '- Reset the alarm from the service menu: hold SET for three seconds, then choose Clear Fault.',
      '',
      '## 3. Leak handling',
      '- Shut the inlet valve first, then disconnect power.',
      '- Dry the base plate and inspect the pressure tank joint before restarting.',
      '- Record the leak point in the ticket process note and attach a photo.',
      '',
      '## 4. Periodic inspection checklist',
      '- TDS reading below 50 ppm on the product line.',
      '- No visible scale on the membrane housing.',
      '- Drain line free of backflow and fixed above the drain trap.',
    ].join('\n'),
  },
  {
    slug: 'thermal-master-t9',
    title: 'ThermalMaster T9 Industrial Chiller Service Manual',
    deviceModel: 'TM-T9',
    summary:
      'Coolant top-up, high-temperature alarm diagnosis and pump maintenance for the ThermalMaster T9.',
    content: [
      '# ThermalMaster T9 Service Manual',
      '',
      '## 1. Coolant top-up',
      '1. Power the unit down and wait ten minutes for the loop to settle.',
      '2. Open the reservoir cap and fill with the specified 30% glycol mixture.',
      '3. Bleed the loop until the level stops dropping.',
      '',
      '## 2. High-temperature alarm (E10)',
      '- E10 trips when the return temperature exceeds 45 degrees Celsius.',
      '- Confirm the radiator air path is clear and the fan spins freely.',
      '- Confirm the pump impeller turns by hand with power isolated.',
      '- After clearing, run a ten-minute load test before returning the device to service.',
      '',
      '## 3. Pump maintenance',
      '- Replace the mechanical seal every 8000 running hours.',
      '- Check for weeping at the seal housing; a dry housing is normal.',
      '',
      '## 4. Periodic inspection checklist',
      '- Coolant level within the marked range.',
      '- Condenser fins clean and straight.',
      '- No alarm history in the last 200 hours of operation.',
    ].join('\n'),
  },
];
