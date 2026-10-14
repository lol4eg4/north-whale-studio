// Service card's API for the plugins that call it.
export interface ServiceApi {
  open(id: number, opener?: HTMLElement | null): void;
}
