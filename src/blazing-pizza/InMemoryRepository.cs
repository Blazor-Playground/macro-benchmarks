using BlazingPizza.Shared;

namespace BlazingPizza.Client;

public class InMemoryRepository : IRepository
{
    private readonly List<Topping> _toppings;
    private readonly List<PizzaSpecial> _specials;
    private readonly List<Order> _orders = new();
    private int _nextOrderId = 1;

    public InMemoryRepository()
    {
        _toppings = new List<Topping>
        {
            new() { Id = 1, Name = "Extra cheese", Price = 2.50m },
            new() { Id = 2, Name = "American bacon", Price = 2.99m },
            new() { Id = 3, Name = "British bacon", Price = 2.99m },
            new() { Id = 4, Name = "Canadian bacon", Price = 2.99m },
            new() { Id = 5, Name = "Tea and crumpets", Price = 5.00m },
            new() { Id = 6, Name = "Fresh-baked scones", Price = 4.50m },
            new() { Id = 7, Name = "Bell peppers", Price = 1.00m },
            new() { Id = 8, Name = "Onions", Price = 1.00m },
            new() { Id = 9, Name = "Mushrooms", Price = 1.00m },
            new() { Id = 10, Name = "Pepperoni", Price = 1.00m },
            new() { Id = 11, Name = "Duck sausage", Price = 3.20m },
            new() { Id = 12, Name = "Venison meatballs", Price = 2.50m },
            new() { Id = 13, Name = "Served on a silver platter", Price = 250.99m },
            new() { Id = 14, Name = "Lobster on top", Price = 64.50m },
            new() { Id = 15, Name = "Sturgeon caviar", Price = 101.75m },
            new() { Id = 16, Name = "Artichoke hearts", Price = 3.40m },
            new() { Id = 17, Name = "Fresh tomatoes", Price = 1.50m },
            new() { Id = 18, Name = "Basil", Price = 1.50m },
            new() { Id = 19, Name = "Steak (medium-rare)", Price = 8.50m },
            new() { Id = 20, Name = "Blazing hot peppers", Price = 4.20m },
            new() { Id = 21, Name = "Buffalo chicken", Price = 5.00m },
            new() { Id = 22, Name = "Blue cheese", Price = 2.50m },
        };

        _specials = new List<PizzaSpecial>
        {
            new() { Id = 1, Name = "Basic Cheese Pizza", Description = "It's cheesy and delicious. Why wouldn't you want one?", BasePrice = 9.99m, ImageUrl = "img/pizzas/cheese.jpg" },
            new() { Id = 2, Name = "The Baconatorizor", Description = "It has EVERY kind of bacon", BasePrice = 11.99m, ImageUrl = "img/pizzas/bacon.jpg" },
            new() { Id = 3, Name = "Classic pepperoni", Description = "It's the pizza you grew up with, but Blazing hot!", BasePrice = 10.50m, ImageUrl = "img/pizzas/pepperoni.jpg" },
            new() { Id = 4, Name = "Buffalo chicken", Description = "Spicy chicken, hot sauce and bleu cheese, guaranteed to warm you up", BasePrice = 12.75m, ImageUrl = "img/pizzas/meaty.jpg" },
            new() { Id = 5, Name = "Mushroom Lovers", Description = "It has mushrooms. Isn't that obvious?", BasePrice = 11.00m, ImageUrl = "img/pizzas/mushroom.jpg" },
            new() { Id = 6, Name = "The Brit", Description = "When in London...", BasePrice = 10.25m, ImageUrl = "img/pizzas/brit.jpg" },
            new() { Id = 7, Name = "Veggie Delight", Description = "It's like salad, but on a pizza", BasePrice = 11.50m, ImageUrl = "img/pizzas/salad.jpg" },
            new() { Id = 8, Name = "Margherita", Description = "Traditional Italian pizza with tomatoes and basil", BasePrice = 9.99m, ImageUrl = "img/pizzas/margherita.jpg" },
        };
    }

    public Task<List<PizzaSpecial>> GetSpecials() => Task.FromResult(_specials);

    public Task<List<Topping>> GetToppings() => Task.FromResult(_toppings.OrderBy(t => t.Name).ToList());

    public Task<int> PlaceOrder(Order order)
    {
        order.OrderId = _nextOrderId++;
        order.CreatedTime = DateTime.Now;
        order.DeliveryLocation = new LatLong(51.5001, -0.1239);
        order.UserId ??= "fake-user-id";
        _orders.Add(order);
        return Task.FromResult(order.OrderId);
    }

    public Task<List<OrderWithStatus>> GetOrdersAsync()
    {
        var result = _orders
            .OrderByDescending(o => o.CreatedTime)
            .Select(OrderWithStatus.FromOrder)
            .ToList();
        return Task.FromResult(result);
    }

    public Task<List<OrderWithStatus>> GetOrdersAsync(string userId)
    {
        var result = _orders
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedTime)
            .Select(OrderWithStatus.FromOrder)
            .ToList();
        return Task.FromResult(result);
    }

    public Task<OrderWithStatus> GetOrderWithStatus(int orderId)
    {
        var order = _orders.SingleOrDefault(o => o.OrderId == orderId)
            ?? throw new ArgumentException($"Order {orderId} not found");
        return Task.FromResult(OrderWithStatus.FromOrder(order));
    }

    public Task<OrderWithStatus> GetOrderWithStatus(int orderId, string userId)
    {
        var order = _orders.SingleOrDefault(o => o.OrderId == orderId && o.UserId == userId)
            ?? throw new ArgumentException($"Order {orderId} not found for user {userId}");
        return Task.FromResult(OrderWithStatus.FromOrder(order));
    }

    public Task SubscribeToNotifications(NotificationSubscription subscription)
    {
        return Task.CompletedTask;
    }
}
