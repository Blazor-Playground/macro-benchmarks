export class FocusPublicationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FocusPublicationError';
    }
}
