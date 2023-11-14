import Event from "utils/Event"

/**
 * We will have a global event queue that handlers can choose to perform actions based on the events that appear in the queue.
 */
export default interface IEventHandler {
  handle(event: Event): void
}
