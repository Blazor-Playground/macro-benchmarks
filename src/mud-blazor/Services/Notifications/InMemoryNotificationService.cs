// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using Blazored.LocalStorage;
using MudBlazor.Docs.NotificationContent;

namespace MudBlazor.Docs.Services.Notifications;

public class InMemoryNotificationService(ILocalStorageService localStorageService) : INotificationService
{
    private const string LocalStorageKey = "__notficationTimestamp";

    private readonly List<NotificationMessage> _messages = [];

    private async Task<DateTime> GetLastReadTimestamp()
    {
        if (!await localStorageService.ContainKeyAsync(LocalStorageKey))
        {
            return DateTime.MinValue;
        }

        var timestamp = await localStorageService.GetItemAsync<DateTime>(LocalStorageKey);
        return timestamp;
    }

    public async Task<bool> AreNewNotificationsAvailable()
    {
        var timestamp = await GetLastReadTimestamp();
        var entriesFound = _messages.Any(x => x.PublishDate > timestamp);

        return entriesFound;
    }

    public async Task MarkNotificationsAsRead()
    {
        await localStorageService.SetItemAsync(LocalStorageKey, DateTime.UtcNow.Date);
    }

    public async Task MarkNotificationsAsRead(string id)
    {
        var message = await GetMessageById(id);
        if (message == null) { return; }

        var timestamp = await localStorageService.GetItemAsync<DateTime>(LocalStorageKey);
        if (message.PublishDate > timestamp)
        {
            await localStorageService.SetItemAsync(LocalStorageKey, message.PublishDate);
        }

    }

    public Task<NotificationMessage> GetMessageById(string id) =>
        Task.FromResult(_messages.FirstOrDefault(x => x.Id == id));

    public async Task<IDictionary<NotificationMessage, bool>> GetNotifications()
    {
        var lastReadTimestamp = await GetLastReadTimestamp();
        var items = _messages.ToDictionary(x => x, x => lastReadTimestamp > x.PublishDate);
        return items;
    }

    public Task AddNotification(NotificationMessage message)
    {
        _messages.Add(message);
        return Task.CompletedTask;
    }

    public void Preload()
    {
    }
}
