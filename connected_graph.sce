
clc;
clear;

n = input("Enter the number of vertices: ");

A = zeros(n, n);

disp("Enter the adjacency matrix row by row:");

for i = 1:n
    A(i, :) = input("Enter row: ");
end

// Calculate degrees of vertices
degree = zeros(1, n);

for i = 1:n
    degree(i) = sum(A(i, :));
end

disp("Degrees of vertices:");
disp(degree);

disp("Degree sequence:");
disp(gsort(degree, "g", "i"));

// Check connectivity using reachability
visited = zeros(1, n);
visited(1) = 1;

for k = 1:n
    for i = 1:n
        if visited(i) == 1 then
            for j = 1:n
                if A(i, j) == 1 then
                    visited(j) = 1;
                end
            end
        end
    end
end

if sum(visited) == n then
    disp("The graph is connected.");
else
    disp("The graph is disconnected.");
end
