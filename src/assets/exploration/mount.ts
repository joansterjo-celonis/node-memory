// Imperative mount API for non-React hosts (e.g. Angular EMS One).
//
// Typical Angular usage:
//
//   import { mountExplorationAsset } from '@ems/exploration';
//
//   @Component({ ... })
//   export class ExplorationHostComponent implements OnInit, OnDestroy {
//     @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
//     private handle?: ExplorationMountHandle;
//
//     ngOnInit() {
//       this.handle = mountExplorationAsset(this.host.nativeElement, {
//         assetId: this.assetId,
//         dataProvider: this.kmProvider,
//         initialStateYaml: this.yaml,
//         onStateChange: (yaml) => this.save$.next(yaml),
//       });
//     }
//     ngOnDestroy() { this.handle?.unmount(); }
//   }
//
// A web-component wrapper can also live here if/when the EMS team decides
// that's the preferred integration pattern (see plan §9 decision #1).

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ExplorationAsset, { type ExplorationAssetProps } from './ExplorationAsset';

export interface ExplorationMountHandle {
  update(nextProps: Partial<ExplorationAssetProps>): void;
  unmount(): void;
}

export function mountExplorationAsset(
  element: HTMLElement,
  props: ExplorationAssetProps
): ExplorationMountHandle {
  const root: Root = createRoot(element);
  let current: ExplorationAssetProps = props;

  const render = () => {
    root.render(React.createElement(ExplorationAsset, current));
  };
  render();

  return {
    update(nextProps) {
      current = { ...current, ...nextProps };
      render();
    },
    unmount() {
      root.unmount();
    },
  };
}
